// Posting to X. Without credentials (or with DRY_RUN=1) posts are written to out/dryrun/ instead.
import fs from 'node:fs';
import path from 'node:path';
import { TwitterApi } from 'twitter-api-v2';
import { ROOT } from './config.js';

const KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
let client;

export function xEnabled() {
  return !process.env.DRY_RUN && KEYS.every((k) => process.env[k]);
}

function api() {
  client ??= new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });
  return client;
}

/**
 * Posts text with one PNG. Links are deliberately never added: link posts cost far more per call.
 * Without X credentials the post is not sent: it is saved to queue/ for a person to post by hand
 * (free). With DRY_RUN=1 it goes to out/dryrun/ and nothing is kept.
 */
export async function post({ text, png, slug = 'post' }) {
  if (!xEnabled()) {
    const dry = Boolean(process.env.DRY_RUN);
    const dir = dry ? path.join(ROOT, 'out', 'dryrun') : path.join(ROOT, 'queue');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 13).replace('T', '-');
    const id = `${dry ? 'dry' : 'manual'}-${stamp}-${slug}-${Math.floor(Math.random() * 1e4)}`;
    fs.writeFileSync(path.join(dir, `${id}.txt`), text);
    if (png) fs.writeFileSync(path.join(dir, `${id}.png`), png);
    console.log(`[${dry ? 'dry run' : 'queued for manual posting'}] ${text.replace(/\n+/g, ' / ')}`);
    return { id };
  }
  const media = png ? { media_ids: [await api().v2.uploadMedia(png, { media_type: 'image/png' })] } : undefined;
  const res = await api().v2.tweet({ text, ...(media && { media }) });
  return { id: res.data.id };
}

/** Likes + reposts + replies + quotes for up to 100 of our own posts. Costs a small read fee per post. */
export async function engagement(ids) {
  const real = ids.filter((id) => /^\d+$/.test(String(id))).slice(-100);
  if (!xEnabled() || !real.length) return null;
  const res = await api().v2.tweets(real, { 'tweet.fields': ['public_metrics'] });
  return (res.data || []).reduce((sum, t) => {
    const m = t.public_metrics || {};
    return sum + (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0);
  }, 0);
}
