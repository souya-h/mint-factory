// One pass of the bot. GitHub Actions runs this hourly (see .github/workflows/bot.yml).
// For every project it: deploys if due, fixes the daily seed, forwards revenue, posts, applies the
// kill rules, and records metrics. All memory lives in state.json, which the workflow commits back.
import fs from 'node:fs';
import path from 'node:path';
import { formatEther, parseEther } from 'viem';
import { compile } from '../lib/compile.js';
import {
  ROOT, loadConfig, loadProjects, loadDeployments, loadState, saveState, publicClient, walletClient, revenueWei,
} from '../lib/config.js';
import { deployProject } from '../lib/deploy.js';
import { renderSvg, svgToPng, sampleInput, today, isoDate } from '../lib/render.js';
import { post, engagement, xEnabled, myUserId, mentions, reply } from '../lib/x.js';
import { parseTarget, resolveName, shortAddress } from '../lib/mentions.js';

const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

const cfg = loadConfig();
const chain = cfg.chain;
const client = publicClient(chain);
const wallet = walletClient(chain);
const editionAbi = compile().Edition.abi;
const state = loadState();
const now = Math.floor(Date.now() / 1000);
const todayStr = isoDate(today());
const rows = [];
const manualFile = path.join(ROOT, 'manual-engagement.json');
const manualEngagement = fs.existsSync(manualFile) ? JSON.parse(fs.readFileSync(manualFile, 'utf8')) : {};

if (state.day !== todayStr) {
  state.day = todayStr;
  state.postsToday = 0;
}
const canPost = () => state.postsToday < cfg.maxPostsPerDay;

async function send(wallet, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${request.functionName}`);
}

/**
 * post.slotsUTC: fixed hours (UTC) to post at, e.g. [1, 14]. A slot is used if the bot runs within
 * 3 hours after it, so a late or skipped hourly run does not lose the post.
 * Without slots, falls back to post.everyHours (default 24) since the last post.
 */
function postDue(postCfg, lastPostAt) {
  const slots = process.env.IGNORE_SLOTS ? null : postCfg?.slotsUTC; // tests run at arbitrary hours
  if (!slots?.length) return now - lastPostAt >= (postCfg?.everyHours || 24) * 3600 - 600;
  const dayStart = Math.floor(now / 86400) * 86400;
  const times = [...slots.map((h) => dayStart - 86400 + h * 3600), ...slots.map((h) => dayStart + h * 3600)];
  const latest = Math.max(...times.filter((t) => t <= now));
  return now - latest <= 3 * 3600 && lastPostAt < latest;
}

function fill(template, project, supply, price = 0n) {
  return template
    .replaceAll('{price}', formatEther(price))
    .replaceAll('{nextStep}', String(project.stepEvery ? project.stepEvery - (Number(supply) % project.stepEvery) : ''))
    .replaceAll('{hoursLeft}', String(24 - new Date(now * 1000).getUTCHours()))
    .replaceAll('{date}', todayStr)
    .replaceAll('{supply}', String(supply))
    .replaceAll('{name}', project.name)
    .replaceAll('{handle}', cfg.handle || '');
}

async function publish(project, ps, dep, text) {
  const input = await sampleInput(client, project, dep, cfg, editionAbi);
  const png = svgToPng(await renderSvg(client, project, input.seed, input.data, dep));
  const { id } = await post({ text, png, slug: project.slug });
  ps.tweetIds = [...(ps.tweetIds || []), id].slice(-100);
  ps.postCount = (ps.postCount || 0) + 1;
  ps.lastPostAt = now;
  state.postsToday++;
}

async function runProject(project) {
  const ps = (state.projects[project.slug] ??= { postCount: 0, lastPostAt: 0, lastSupply: 0, tweetIds: [], engagement: 0 });
  let dep = loadDeployments(chain)[project.slug];
  const row = { slug: project.slug, status: '', supply: 0, revenue: '0', note: '' };
  const kill = (reason) => {
    ps.killed = true;
    ps.killedReason = reason;
  };
  const finish = () => {
    row.status = ps.killed ? 'killed' : project.status === 'paused' ? 'paused' : dep ? 'live' : 'teaser';
    row.note = ps.killedReason || (ps.candidate && !dep ? 'teaser passed: ready to go live' : '');
    row.posts = ps.postCount || 0;
    row.engagement = ps.engagement || 0;
    rows.push(row);
  };

  if (project.status === 'paused' || ps.killed) return finish();

  // Engagement on our posts. With the X API it is read every 3 days (reads are billed per post); in manual mode (no API)
  // it comes from manual-engagement.json, which a person fills in from X's own analytics.
  const manual = manualEngagement[project.slug];
  const daysSinceRead = ps.engagementDay ? (Date.parse(todayStr) - Date.parse(ps.engagementDay)) / 86_400_000 : Infinity;
  if (xEnabled() && daysSinceRead >= 3 && ps.tweetIds?.length) {
    const e = await engagement(ps.tweetIds);
    if (e !== null) ps.engagement = e;
    ps.engagementDay = todayStr;
  } else if (!xEnabled() && Number.isFinite(manual)) {
    ps.engagement = manual;
  }
  const measured = xEnabled() || Number.isFinite(manual);

  // Teaser phase: judge the idea on engagement before spending anything on deployment.
  if (!dep && project.status !== 'live' && project.teaser && measured && ps.postCount >= project.teaser.afterPosts) {
    if (ps.engagement >= project.teaser.promoteEngagement) {
      ps.candidate = true;
      if (cfg.autoDeploy) ps.promoted = true;
    } else if (ps.engagement < project.teaser.killEngagement) {
      kill(`teaser: engagement ${ps.engagement} < ${project.teaser.killEngagement} after ${ps.postCount} posts`);
      return finish();
    }
  }

  if (!dep && (project.status === 'live' || ps.promoted) && wallet) {
    dep = await deployProject(project, chain);
    console.log(`deployed ${project.slug}: ${dep.edition}`);
  }

  let supply = 0n;
  let price = parseEther(project.priceEth);
  if (dep) {
    const edition = { address: dep.edition, abi: editionAbi };
    if (project.seedMode === 'perDay' && wallet) {
      const seed = await client.readContract({ ...edition, functionName: 'daySeed', args: [today()] });
      if (seed === 0n) await send(wallet, { ...edition, functionName: 'poke' });
    }

    supply = await client.readContract({ ...edition, functionName: 'totalSupply' });
    row.supply = Number(supply);
    row.revenue = formatEther(
      revenueWei(supply, parseEther(project.priceEth), parseEther(project.priceStepEth || '0'), project.stepEvery || 0),
    );
    price = await client.readContract({ ...edition, functionName: 'currentPrice' });

    const balance = await client.getBalance({ address: dep.edition });
    if (wallet && balance > 0n && balance >= parseEther(cfg.withdrawMinEth || '0')) {
      await send(wallet, { ...edition, functionName: 'withdraw' });
    }

    const hit = MILESTONES.filter((m) => supply >= BigInt(m) && (ps.lastSupply || 0) < m).pop();
    if (hit && canPost()) {
      await publish(project, ps, dep, `${project.name}: ${hit === 1 ? 'first mint is in.' : `${hit} minted.`}`);
    }
    ps.lastSupply = Number(supply);

    if (project.kill && now > dep.deployedAt + project.kill.afterHours * 3600 && supply < BigInt(project.kill.minMints)) {
      kill(`live: ${supply} mints < ${project.kill.minMints} after ${project.kill.afterHours}h`);
      return finish();
    }
  }

  // Before the sale opens, use the teaser wording so posts never promise a mint that is not live.
  const pool = !dep && project.post?.teaserTemplates?.length ? project.post.teaserTemplates : project.post?.templates || [];
  const templates = pool.filter((t) => supply > 0n || !t.includes('{supply}'));
  if (templates.length && canPost() && postDue(project.post, ps.lastPostAt || 0)) {
    await publish(project, ps, dep, fill(templates[(ps.postCount || 0) % templates.length], project, supply, price));
  }
  finish();
}

for (const project of loadProjects()) {
  try {
    await runProject(project);
  } catch (e) {
    console.error(`${project.slug}: ${e.shortMessage || e.message}`);
    rows.push({ slug: project.slug, status: 'error', supply: 0, revenue: '0', posts: 0, engagement: 0, note: (e.shortMessage || e.message).slice(0, 120) });
  }
}

// Replies: someone mentions @<handle> with a wallet address or .eth name, and gets their artwork back.
async function answerMentions() {
  const rc = cfg.replies;
  if (!rc?.project || !xEnabled()) return;
  const project = loadProjects().find((p) => p.slug === rc.project);
  if (!project || project.stats || project.status === 'paused') return;
  const st = (state.replies ??= { sinceId: null, day: '', count: 0, userId: null });
  if (st.day !== todayStr) {
    st.day = todayStr;
    st.count = 0;
  }
  const left = (rc.maxPerDay ?? 15) - st.count;
  if (left <= 0) return;
  st.userId ??= await myUserId();
  // On the very first run only look at the latest few, so old mentions are not all billed and answered.
  const found = await mentions(st.userId, st.sinceId, st.sinceId ? 20 : 5);
  const dep = loadDeployments(chain)[project.slug];
  let answered = 0;
  for (const m of found) {
    st.sinceId = m.id;
    if (m.author_id === st.userId || answered >= Math.min(left, rc.maxPerRun ?? 10)) continue;
    const target = parseTarget(m.text);
    if (!target) continue; // nothing to draw; stay silent rather than spend on a reply
    const address = target.address || (await resolveName(target.name));
    if (!address) continue;
    const svg = await renderSvg(client, project, BigInt(address), 0n, dep);
    const who = target.name || shortAddress(address);
    const tail = dep ? 'Yours to mint, link in bio.' : 'Mint opens soon.';
    await reply({ text: `${project.name} for ${who}.\n\nEvery wallet has exactly one. ${tail}`, png: svgToPng(svg), inReplyTo: m.id });
    answered++;
    st.count++;
  }
  if (answered) console.log(`answered ${answered} mention(s)`);
}

try {
  await answerMentions();
} catch (e) {
  console.error(`mentions: ${e.shortMessage || e.message}`);
}

saveState(state);

const ts = new Date().toISOString();
fs.appendFileSync(
  path.join(ROOT, 'metrics', 'history.csv'),
  rows.map((r) => [ts, r.slug, r.status, r.supply, r.revenue, r.posts, r.engagement].join(',')).join('\n') + '\n',
);
fs.writeFileSync(
  path.join(ROOT, 'metrics', 'REPORT.md'),
  `# Report\n\nUpdated ${ts} (chain: ${chain}, posts today: ${state.postsToday}/${cfg.maxPostsPerDay})\n\n` +
    '| project | status | mints | revenue (ETH) | posts | engagement | note |\n|---|---|---|---|---|---|---|\n' +
    rows.map((r) => `| ${r.slug} | ${r.status} | ${r.supply} | ${r.revenue} | ${r.posts} | ${r.engagement} | ${r.note} |`).join('\n') +
    '\n',
);
console.table(rows);
