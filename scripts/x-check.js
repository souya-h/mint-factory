// Confirms the X credentials work without posting anything. Costs one user lookup.
import { TwitterApi } from 'twitter-api-v2';

const keys = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
const missing = keys.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`missing secrets: ${missing.join(', ')}`);
  process.exit(1);
}
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});
try {
  const me = await client.v2.me();
  console.log(`ok: authenticated as @${me.data.username}`);
} catch (e) {
  console.error(`X API error ${e.code ?? ''}: ${JSON.stringify(e.data ?? e.message)}`);
  process.exit(1);
}
