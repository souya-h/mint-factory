// node scripts/deploy.js <slug> [--chain base|baseSepolia]
import { loadConfig, loadProjects } from '../lib/config.js';
import { deployProject } from '../lib/deploy.js';

const args = process.argv.slice(2);
const i = args.indexOf('--chain');
if (i >= 0) process.env.CHAIN = args.splice(i, 2)[1];
const cfg = loadConfig();
const project = loadProjects().find((p) => p.slug === args[0]);
if (!project) throw new Error(`usage: node scripts/deploy.js <slug> [--chain name]   (no project "${args[0]}")`);

const dep = await deployProject(project, cfg.chain);
console.log(`${project.slug} deployed on ${cfg.chain}`);
console.log(`  edition:  ${dep.edition}\n  renderer: ${dep.renderer}\n  payout:   ${dep.payout}`);
