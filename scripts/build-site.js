// Builds dist/: one static mint page per project plus an index. Hosted free on GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compile } from '../lib/compile.js';
import { ROOT, CHAINS, loadConfig, loadProjects, loadDeployments, loadState, rpcUrl } from '../lib/config.js';

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
const USED = ['mint', 'totalSupply', 'daySeed', 'minted'];

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const listed = [];
for (const p of loadProjects()) {
  if (p.status === 'paused' || state.projects[p.slug]?.killed) continue;
  const dep = deployments[p.slug] || null;
  const pageCfg = {
    project: { slug: p.slug, name: p.name, description: p.description, seedMode: p.seedMode, priceEth: p.priceEth, stats: Boolean(p.stats) },
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
  };
  const html = template
    .replaceAll('__TITLE__', esc(p.name))
    .replaceAll('__DESC__', esc(p.description))
    .replace('__VIEM__', viemVersion)
    .replace('__STATS_JS__', () => statsJs)
    .replace('__CFG__', () => JSON.stringify(pageCfg).replace(/</g, '\\u003c'));
  fs.mkdirSync(path.join(dist, p.slug), { recursive: true });
  fs.writeFileSync(path.join(dist, p.slug, 'index.html'), html);
  listed.push(p);
}

fs.writeFileSync(
  path.join(dist, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Editions</title><style>:root{color-scheme:dark}body{margin:0;background:#0c0d10;color:#e8e6e1;font:16px/1.5 ui-monospace,Menlo,Consolas,monospace}
main{max-width:480px;margin:0 auto;padding:32px 20px}a{color:#e8e6e1;display:block;padding:16px;border:1px solid #2c2f38;border-radius:6px;margin:0 0 12px;text-decoration:none}
a:hover,a:focus-visible{border-color:#7fb3ff}span{color:#a9a69f;display:block;font-size:14px}</style></head><body><main>
${listed.map((p) => `<a href="./${p.slug}/"><strong>${esc(p.name)}</strong><span>${esc(p.description)}</span></a>`).join('\n')}
</main></body></html>\n`,
);
console.log(`built ${listed.length} page(s) in dist/ for ${cfg.chain}`);
