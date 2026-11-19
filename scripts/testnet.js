// Test copy of a project on Base Sepolia: deploys it once (test ETH only), sends one gift to a dummy wallet,
// and checks the token reads back. The page for it is built under /test/ by the site workflow.
// Usage: CHAIN=baseSepolia node scripts/testnet.js [slug]
import assert from 'node:assert/strict';
import { formatEther } from 'viem';
import { compile } from '../lib/compile.js';
import { loadConfig, loadProjects, loadDeployments, publicClient, walletClient } from '../lib/config.js';
import { deployProject } from '../lib/deploy.js';

const cfg = loadConfig();
if (cfg.chain !== 'baseSepolia') throw new Error('run with CHAIN=baseSepolia');
const slug = process.argv[2] || 'hash-haiku';
const project = loadProjects().find((p) => p.slug === slug);
const client = publicClient(cfg.chain);
const wallet = walletClient(cfg.chain);
const abi = compile().Edition.abi;
console.log(`deployer ${wallet.account.address}: ${formatEther(await client.getBalance({ address: wallet.account.address }))} ETH`);

let dep = loadDeployments(cfg.chain)[slug];
if (!dep) {
  dep = await deployProject(project, cfg.chain);
  console.log(`deployed ${slug}: edition ${dep.edition}, renderer ${dep.renderer}`);
}
const ed = { address: dep.edition, abi };
const read = (functionName, args = []) => client.readContract({ ...ed, functionName, args });
console.log(`price ${formatEther(await read('currentPrice'))} ETH, supply ${await read('totalSupply')}, gifted ${await read('gifted')}/${await read('giftLimit')}`);

if (project.giftLimit && (await read('gifted')) === 0n) {
  const to = '0x000000000000000000000000000000000000dEaD';
  const hash = await wallet.writeContract({ ...ed, functionName: 'gift', args: [to, 0n] });
  assert.equal((await client.waitForTransactionReceipt({ hash })).status, 'success');
  console.log(`gift sent to ${to}: ${hash}`);
}
if ((await read('totalSupply')) > 0n) {
  const meta = JSON.parse(Buffer.from((await read('tokenURI', [1n])).split(',')[1], 'base64').toString());
  assert.ok(meta.image.startsWith('data:image/svg+xml;base64,'));
  console.log(`token 1: ${meta.name}, image ${meta.image.length} chars`);
}
console.log(`price after gift ${formatEther(await read('currentPrice'))} ETH (gifts must not move it)`);
