// Builds dist/: one static mint page per project plus an index. Hosted free on GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compile } from '../lib/compile.js';
import { ROOT, CHAINS, loadConfig, loadProjects, loadDeployments, loadState, rpcUrl, publicClient } from '../lib/config.js';
import { renderSvg, sampleInput } from '../lib/render.js';
import { cardPng } from '../lib/card.js';

const require = createRequire(import.meta.url);
const cfg = loadConfig();
const chain = CHAINS[cfg.chain];
const contracts = compile();
const deployments = loadDeployments(cfg.chain);
const state = loadState();
const template = fs.readFileSync(path.join(ROOT, 'site', 'template.html'), 'utf8');
const statsJs = fs.readFileSync(path.join(ROOT, 'site', 'stats.js'), 'utf8').replace(/^export /gm, '');
const viemVersion = require('viem/package.json').version;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const USED = ['mint', 'totalSupply', 'gifted', 'daySeed', 'minted', 'currentPrice', 'seedUsed'];

// TESTNET=1 builds a labelled test copy (e.g. CHAIN=baseSepolia OUT_DIR=dist/test) that lists only deployed projects.
const testnet = Boolean(process.env.TESTNET);
const dist = path.join(ROOT, process.env.OUT_DIR || 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const siteUrl = (cfg.siteUrl || '').replace(/\/?$/, '/') + (testnet && cfg.siteUrl ? 'test/' : '');
const client = publicClient(cfg.chain);
// Optional page-view counting with Cloudflare Web Analytics. The token is public (it ships in the page).
const token = cfg.analytics?.cloudflareToken;
const analytics = token
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token.replace(/[^a-zA-Z0-9]/g, '')}"}'></script>`
  : '';

/** Writes og.png for a project and returns its absolute URL, or '' if it could not be drawn. */
async function card(p, dep) {
  try {
    const input = await sampleInput(client, p, dep, cfg, contracts.Edition.abi);
    const svg = await renderSvg(client, p, input.seed, input.data, dep);
    fs.writeFileSync(path.join(dist, p.slug, 'og.png'), cardPng(p, svg));
    return siteUrl ? `${siteUrl}${p.slug}/og.png` : `./og.png`;
  } catch (e) {
    console.warn(`no preview card for ${p.slug}: ${e.shortMessage || e.message}`);
    return '';
  }
}

const listed = [];
for (const p of loadProjects()) {
  if (p.status === 'paused' || state.projects[p.slug]?.killed) continue;
  const dep = deployments[p.slug] || null;
  if (testnet && !dep) continue;
  const pageCfg = {
    project: { slug: p.slug, name: p.name, description: p.description, seedMode: p.seedMode, priceEth: p.priceEth, priceStepEth: p.priceStepEth || '0', stepEvery: p.stepEvery || 0, stats: Boolean(p.stats), launch: p.launch || null, giftNote: p.giftLimit ? p.giftNote || '' : '' },
    chain: {
      id: chain.id,
      name: chain.name,
      // The page runs in visitors' browsers, so it must use a public endpoint, never a private RPC_URL.
      rpc: cfg.chain === 'local' ? rpcUrl('local') : chain.rpcUrls.default.http[0],
      explorer: chain.blockExplorers?.default.url || '',
    },
    deployment: dep && { edition: dep.edition, renderer: dep.renderer },
    editionAbi: contracts.Edition.abi.filter((x) => USED.includes(x.name)),
    rendererAbi: contracts[p.renderer].abi.filter((x) => x.name === 'render'),
    rendererBytecode: dep ? null : contracts[p.renderer].bytecode,
    statsHosts: cfg.statsHosts,
    statsYear: cfg.statsYear,
    handle: cfg.handle,
    author: cfg.author?.line || '',
    testnet,
  };
  fs.mkdirSync(path.join(dist, p.slug), { recursive: true });
  const image = await card(p, dep);
  const html = template
    .replace('__OG_IMAGE__', image ? `<meta property="og:image" content="${image}">\n<meta name="twitter:image" content="${image}">` : '')
    .replace('__ANALYTICS__', () => (testnet ? '<meta name="robots" content="noindex">' : analytics))
    .replaceAll('__TITLE__', esc(p.name))
    .replaceAll('__DESC__', esc(p.description))
    .replace('__VIEM__', viemVersion)
    .replace('__STATS_JS__', () => statsJs)
    .replace('__CFG__', () => JSON.stringify(pageCfg).replace(/</g, '\\u003c'));
  fs.writeFileSync(path.join(dist, p.slug, 'index.html'), html);
  listed.push(p);
}

fs.writeFileSync(
  path.join(dist, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Okonomi Press${testnet ? ' (testnet)' : ''}</title>${testnet ? '<meta name="robots" content="noindex">' : analytics}<style>:root{color-scheme:dark}body{margin:0;background:#0c0d10;color:#e8e6e1;font:16px/1.5 ui-monospace,Menlo,Consolas,monospace}
main{max-width:480px;margin:0 auto;padding:32px 20px}a{color:#e8e6e1;display:block;padding:16px;border:1px solid #2c2f38;border-radius:6px;margin:0 0 12px;text-decoration:none}
a:hover,a:focus-visible{border-color:#7fb3ff}span{color:#a9a69f;display:block;font-size:14px}</style></head><body><main>
${testnet ? '<p style="color:#ffb86b">TEST COPY on Base Sepolia. Test ETH only. Nothing here is the real sale.</p>' : ''}
${listed.map((p) => `<a href="./${p.slug}/"><strong>${esc(p.name)}</strong><span>${esc(p.description)}</span>${!deployments[p.slug] && p.launch ? `<span>${esc(p.launch.note)}</span>` : ''}${!deployments[p.slug] && p.giftLimit && p.giftNote ? `<span>${esc(p.giftNote)}</span>` : ''}</a>`).join('\n')}
${cfg.author?.line ? `<p style="color:#a9a69f;font-size:14px">${esc(cfg.author.line)}</p>` : ''}
</main></body></html>\n`,
);
console.log(`built ${listed.length} page(s) in dist/ for ${cfg.chain}`);
