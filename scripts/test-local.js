// End-to-end check on a throwaway local chain: deploy, mint, read tokenURI, run the bot twice in dry-run.
// Usage: npm test   (starts `hardhat node` itself; nothing touches a real network)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createTestClient, http, parseEther, publicActions, walletActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

const ROOT = path.resolve(import.meta.dirname, '..');
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // public hardhat test key
const BUYER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const PAYOUT = '0x000000000000000000000000000000000000bEEF';
Object.assign(process.env, { CHAIN: 'local', DEPLOYER_PRIVATE_KEY: KEY, PAYOUT_ADDRESS: PAYOUT, DRY_RUN: '1', IGNORE_SLOTS: '1', RPC_URL: 'http://127.0.0.1:8545' });

// Work on copies so the test never dirties the real state files.
const tracked = ['state.json', 'metrics/history.csv', 'metrics/REPORT.md'];
const backup = Object.fromEntries(tracked.map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]));
fs.rmSync(path.join(ROOT, 'deployments', 'local.json'), { force: true });
fs.writeFileSync(path.join(ROOT, 'state.json'), '{"projects":{},"day":"","postsToday":0}');

const node = spawn('npx', ['hardhat', 'node'], { cwd: ROOT, stdio: 'ignore' });
const cleanup = () => {
  node.kill();
  for (const [f, buf] of Object.entries(backup)) buf ? fs.writeFileSync(path.join(ROOT, f), buf) : fs.rmSync(path.join(ROOT, f), { force: true });
  fs.rmSync(path.join(ROOT, 'deployments', 'local.json'), { force: true });
};
process.on('exit', cleanup);

const client = createTestClient({ chain: hardhat, mode: 'hardhat', transport: http(process.env.RPC_URL) }).extend(publicActions);
for (let i = 0; ; i++) {
  try { await client.getBlockNumber(); break; } catch { if (i > 60) throw new Error('local chain did not start'); await new Promise((r) => setTimeout(r, 500)); }
}

const { compile } = await import('../lib/compile.js');
const { loadProjects, loadDeployments } = await import('../lib/config.js');
const { deployProject } = await import('../lib/deploy.js');
const { renderSvg, svgToPng } = await import('../lib/render.js');
const { packStats } = await import('../site/stats.js');
const abi = compile().Edition.abi;
const buyer = client.extend(walletActions);
const account = privateKeyToAccount(BUYER);
const out = path.join(ROOT, 'out');
fs.mkdirSync(out, { recursive: true });
const decode = (uri) => JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
const mint = async (edition, data, value) => {
  const hash = await buyer.writeContract({ account, address: edition, abi, functionName: 'mint', args: [data], value });
  return client.waitForTransactionReceipt({ hash });
};

for (const project of loadProjects()) {
  // Deployless preview must equal what the deployed renderer returns.
  const before = await renderSvg(client, project, 12345n, 20409n, null);
  const dep = await deployProject(project, 'local');
  assert.equal(await renderSvg(client, project, 12345n, 20409n, dep), before, 'deployless preview differs from deployed');

  const price = parseEther(project.priceEth);
  const edition = { address: dep.edition, abi };
  await assert.rejects(mint(dep.edition, 0n, price - 1n), 'wrong price must revert');

  const data = project.stats ? packStats({ months: [3, 0, 12, 40, 7, 0, 22, 95, 31, 4, 18, 9], activeDays: 141 }) : 0n;
  await mint(dep.edition, data, price);
  assert.equal(await client.readContract({ ...edition, functionName: 'totalSupply' }), 1n);
  assert.equal(await client.getBalance({ address: dep.edition }), price);

  const meta = decode(await client.readContract({ ...edition, functionName: 'tokenURI', args: [1n] }));
  assert.equal(meta.name, `${project.name} #1`);
  const svg = Buffer.from(meta.image.split(',')[1], 'base64').toString();
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  fs.writeFileSync(path.join(out, `test-${project.slug}.svg`), svg);
  fs.writeFileSync(path.join(out, `test-${project.slug}.png`), svgToPng(svg));
  decode(await client.readContract({ ...edition, functionName: 'contractURI' }));

  if (project.seedMode === 'perMinter') {
    await assert.rejects(mint(dep.edition, data, price), 'second mint from the same wallet must revert');
    if (project.stats) assert.ok(svg.includes('TX 241') && svg.includes('ACTIVE DAYS 141'), 'stats not drawn');
  }
  if (project.seedMode === 'perDay') {
    const day = BigInt((await client.getBlock()).timestamp / 86400n);
    const seed = await client.readContract({ ...edition, functionName: 'daySeed', args: [day] });
    assert.notEqual(seed, 0n);
    await mint(dep.edition, 0n, price);
    assert.equal(await client.readContract({ ...edition, functionName: 'seedOf', args: [2n] }), seed, 'same day, same seed');
    assert.ok(svg.includes(new Date(Number(day) * 86400000).toISOString().slice(0, 10)), 'date not drawn');
  }

  // Stepped price: after `stepEvery` mints the price must rise by exactly one step.
  if (project.priceStepEth && project.stepEvery) {
    const step = parseEther(project.priceStepEth);
    const cur = await client.readContract({ ...edition, functionName: 'currentPrice' });
    const minted = await client.readContract({ ...edition, functionName: 'totalSupply' });
    assert.equal(cur, price + step * (minted / BigInt(project.stepEvery)));
  }

  // Anyone can trigger the payout, and it only ever goes to the payout address.
  const paidBefore = await client.getBalance({ address: PAYOUT });
  const held = await client.getBalance({ address: dep.edition });
  const hash = await buyer.writeContract({ account, ...edition, functionName: 'withdraw' });
  await client.waitForTransactionReceipt({ hash });
  assert.equal((await client.getBalance({ address: PAYOUT })) - paidBefore, held);
  console.log(`ok  ${project.slug}`);
}

// Stepped pricing across a boundary: price rises after every 2 mints, old price is refused.
{
  const base = loadProjects().find((p) => p.seedMode === 'perMint') || { ...loadProjects()[0], seedMode: 'perMint' };
  const proj = { ...base, slug: 'step-test', seedMode: 'perMint', priceEth: '0.001', priceStepEth: '0.0005', stepEvery: 2 };
  const dep = await deployProject(proj, 'local');
  const ed = { address: dep.edition, abi };
  const p0 = parseEther('0.001'), p1 = parseEther('0.0015');
  await mint(dep.edition, 0n, p0);
  await mint(dep.edition, 0n, p0);
  assert.equal(await client.readContract({ ...ed, functionName: 'currentPrice' }), p1);
  await assert.rejects(mint(dep.edition, 0n, p0), 'old price must be refused after a step');
  await mint(dep.edition, 0n, p1);
  const { revenueWei } = await import('../lib/config.js');
  assert.equal(await client.getBalance({ address: dep.edition }), revenueWei(3, p0, parseEther('0.0005'), 2));
  const d = loadDeployments('local');
  delete d['step-test'];
  fs.writeFileSync(path.join(ROOT, 'deployments', 'local.json'), JSON.stringify(d));
  console.log('ok  stepped price');
}

// Bot: first pass posts previews (dry run); a second pass right after must not post again.
const runBot = () => execFileSync('node', ['bot/run.js'], { cwd: ROOT, env: process.env, encoding: 'utf8' });
fs.rmSync(path.join(out, 'dryrun'), { recursive: true, force: true });
runBot();
const first = fs.readdirSync(path.join(out, 'dryrun')).filter((f) => f.endsWith('.txt')).length;
assert.ok(first >= loadProjects().length, 'bot did not post');
runBot();
assert.equal(fs.readdirSync(path.join(out, 'dryrun')).filter((f) => f.endsWith('.txt')).length, first, 'bot posted twice');

execFileSync('node', ['scripts/build-site.js'], { cwd: ROOT, env: process.env });
assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'daily-block', 'index.html')));
console.log('ok  site build');

// Kill rule: pretend the projects went live 80 hours ago with too few mints.
const deployments = loadDeployments('local');
const stateFile = path.join(ROOT, 'state.json');
const dl = path.join(ROOT, 'deployments', 'local.json');
for (const d of Object.values(deployments)) d.deployedAt -= 80 * 3600;
fs.writeFileSync(dl, JSON.stringify(deployments));
runBot();
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.ok(Object.values(state.projects).every((p) => p.killed), 'kill rule did not fire');
console.log('ok  bot (post, no double post, kill rule)');

console.log('all checks passed');
process.exit(0);
