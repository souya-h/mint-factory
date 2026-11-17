// Loads config, projects, deployments and runtime state. Everything is a JSON file in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, hardhat } from 'viem/chains';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHAINS = { base, baseSepolia, local: hardhat };
export const SEED_MODES = { perMint: 0, perMinter: 1, perDay: 2 };

const read = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const write = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

export function loadConfig() {
  const cfg = read(path.join(ROOT, 'config.json'), {});
  if (process.env.CHAIN) cfg.chain = process.env.CHAIN;
  if (!CHAINS[cfg.chain]) throw new Error(`config.json: unknown chain "${cfg.chain}"`);
  return cfg;
}

export function loadProjects() {
  const dir = path.join(ROOT, 'projects');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => validate(read(path.join(dir, f)), f));
}

function validate(p, file) {
  for (const k of ['slug', 'name', 'symbol', 'description', 'renderer', 'seedMode', 'priceEth', 'status']) {
    if (p[k] === undefined) throw new Error(`${file}: missing "${k}"`);
  }
  if (!(p.seedMode in SEED_MODES)) throw new Error(`${file}: seedMode must be one of ${Object.keys(SEED_MODES)}`);
  // These strings are written into onchain JSON without escaping.
  for (const k of ['name', 'symbol', 'description']) {
    if (/["\\\n]/.test(p[k])) throw new Error(`${file}: "${k}" must not contain quotes, backslashes or newlines`);
  }
  return p;
}

export const loadDeployments = (chain) => read(path.join(ROOT, 'deployments', `${chain}.json`), {});
export const saveDeployments = (chain, d) => write(path.join(ROOT, 'deployments', `${chain}.json`), d);
export const loadState = () => read(path.join(ROOT, 'state.json'), { projects: {}, day: '', postsToday: 0 });
export const saveState = (s) => write(path.join(ROOT, 'state.json'), s);

export function rpcUrl(chainName) {
  return process.env.RPC_URL || CHAINS[chainName].rpcUrls.default.http[0];
}

export function publicClient(chainName) {
  return createPublicClient({ chain: CHAINS[chainName], transport: http(rpcUrl(chainName)) });
}

/** Returns null when no deployer key is configured. */
export function walletClient(chainName) {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) return null;
  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
  return createWalletClient({ account, chain: CHAINS[chainName], transport: http(rpcUrl(chainName)) });
}

/** Total paid for the first `supply` mints under a stepped price (all values in wei). */
export function revenueWei(supply, price, step, every) {
  supply = BigInt(supply);
  if (!step || !every) return supply * price;
  const e = BigInt(every);
  const full = supply / e; // completed tiers
  const rest = supply % e;
  // tiers 0..full-1 each have `every` mints at price + i*step
  const tiersTotal = e * (full * price + step * ((full * (full - 1n)) / 2n));
  return tiersTotal + rest * (price + step * full);
}
