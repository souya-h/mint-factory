// Shared by the mint page (browser) and the bot (Node). No imports on purpose.
// Reads a wallet's transactions for one calendar year from Blockscout's public API (no key needed).

/** @returns {{months: number[], activeDays: number}} */
export async function fetchStats(address, hosts, year) {
  const t0 = Date.UTC(year, 0, 1) / 1000;
  const t1 = Date.UTC(year + 1, 0, 1) / 1000 - 1;
  const months = new Array(12).fill(0);
  const days = new Set();
  let ok = 0;
  for (const host of hosts) {
    const url =
      `${host}/api?module=account&action=txlist&address=${address}` +
      `&start_timestamp=${t0}&end_timestamp=${t1}&sort=asc&page=1&offset=10000`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = await res.json();
      ok++;
      if (!Array.isArray(body.result)) continue;
      for (const tx of body.result) {
        const ts = Number(tx.timeStamp);
        if (!(ts >= t0 && ts <= t1)) continue;
        if (String(tx.from).toLowerCase() !== address.toLowerCase()) continue; // only what the wallet sent
        const d = new Date(ts * 1000);
        months[d.getUTCMonth()]++;
        days.add(Math.floor(ts / 86400));
      }
    } catch {
      /* try the next host */
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
