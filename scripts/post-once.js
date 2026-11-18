// One manual post through the X API (never through the website): node scripts/post-once.js <text file> [png file]
// Run by the "post-once" workflow so the API keys stay in GitHub secrets.
import fs from 'node:fs';
import { post, xEnabled } from '../lib/x.js';

const [textFile, pngFile] = process.argv.slice(2);
if (!textFile) throw new Error('usage: node scripts/post-once.js <text file> [png file]');
if (!xEnabled()) throw new Error('X credentials are not set (or DRY_RUN is on)');
const text = fs.readFileSync(textFile, 'utf8').trim();
const png = pngFile ? fs.readFileSync(pngFile) : undefined;
const { id } = await post({ text, png, slug: 'manual' });
console.log(`posted: https://x.com/i/web/status/${id}`);
