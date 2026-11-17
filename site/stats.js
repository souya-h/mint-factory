// Shared by the mint page (browser) and the bot (Node). No imports on purpose.
// Reads a wallet's transactions for one calendar year from Blockscout's public API (no key needed).

/** @returns {{months: number[], activeDays: number}} */
export async function fetchStats(address, hosts, year) {
  const t0 = Date.UTC(year, 0, 1) / 1000;
  const t1 = Date.UTC(year + 1, 0, 1) / 1000 - 1;
  const months = new Array(12).fill(0);
  const days = new Set();
  // All sources are queried at once; a large wallet can take 10-20 s per source.
  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      const url =
        `${host}/api?module=account&action=txlist&address=${address}` +
        `&start_timestamp=${t0}&end_timestamp=${t1}&sort=asc&page=1&offset=10000`;
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  );
  let ok = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    ok++;
    if (!Array.isArray(r.value.result)) continue;
    for (const tx of r.value.result) {
      const ts = Number(tx.timeStamp);
      if (!(ts >= t0 && ts <= t1)) continue;
      if (String(tx.from).toLowerCase() !== address.toLowerCase()) continue; // only what the wallet sent
      months[new Date(ts * 1000).getUTCMonth()]++;
      days.add(Math.floor(ts / 86400));
    }
  }
  if (!ok) throw new Error('no data source reachable');
  return { months, activeDays: days.size };
}

/** Packs stats into the uint256 the Wrapped renderer expects. Returns a BigInt. */
export function packStats({ months, activeDays }) {
  let v = 0n;
  months.forEach((c, i) => {
    v |= BigInt(Math.min(c, 0xffff)) << BigInt(16 * i);
  });
  return v | (BigInt(Math.min(activeDays, 0xffff)) << 192n);
}
