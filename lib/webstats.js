// Page views from Cloudflare Web Analytics, read with a read-only API token (secret CF_API_TOKEN).
// Only totals per page and per referring site are kept: no visitor-level data exists in Web Analytics anyway.
const API = 'https://api.cloudflare.com/client/v4/graphql';

export async function webStats({ accountTag, siteTag }, from, to) {
  const token = process.env.CF_API_TOKEN;
  if (!token || !accountTag || !siteTag) return null;
  const query = `query($a: String!, $s: String!, $from: Date!, $to: Date!) {
    viewer { accounts(filter: { accountTag: $a }) {
      byPath: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $s, date_geq: $from, date_leq: $to, bot: 0 }, limit: 50, orderBy: [count_DESC]) {
        count sum { visits } dimensions { requestPath }
      }
      byRef: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $s, date_geq: $from, date_leq: $to, bot: 0 }, limit: 10, orderBy: [count_DESC]) {
        count dimensions { refererHost }
      }
    } } }`;
  const res = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: accountTag, s: siteTag, from, to } }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  const acc = json.data.viewer.accounts[0] || { byPath: [], byRef: [] };
  const pages = acc.byPath.map((g) => ({ path: g.dimensions.requestPath, views: g.count, visits: g.sum?.visits ?? null }));
  return {
    from,
    to,
    views: pages.reduce((n, p) => n + p.views, 0),
    visits: pages.reduce((n, p) => n + (p.visits || 0), 0),
    pages: pages.filter((p) => !p.path.startsWith('/mint-factory/test/')).slice(0, 10),
    referrers: acc.byRef.map((g) => ({ host: g.dimensions.refererHost || '(direct)', views: g.count })),
  };
}
