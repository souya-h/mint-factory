// node scripts/preview.js <slug>  ->  out/<slug>.svg and out/<slug>.png
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../lib/compile.js';
import { ROOT, loadConfig, loadProjects, loadDeployments, publicClient } from '../lib/config.js';
import { renderSvg, svgToPng, sampleInput } from '../lib/render.js';

const cfg = loadConfig();
const slug = process.argv[2];
const project = loadProjects().find((p) => p.slug === slug);
if (!project) throw new Error(`usage: node scripts/preview.js <slug>   (no project "${slug}")`);

const client = publicClient(cfg.chain);
const dep = loadDeployments(cfg.chain)[slug];
const input = await sampleInput(client, project, dep, cfg, compile().Edition.abi);
const svg = await renderSvg(client, project, input.seed, input.data, dep);
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', `${slug}.svg`), svg);
fs.writeFileSync(path.join(ROOT, 'out', `${slug}.png`), svgToPng(svg));
console.log(`wrote out/${slug}.svg and out/${slug}.png (${input.label})`);
