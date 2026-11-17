// Draws a project's artwork by calling its renderer contract. Before deployment the renderer's
// bytecode is executed with a "deployless" eth_call, so previews cost nothing and match the chain exactly.
import { keccak256, toHex } from 'viem';
import { privateKeyToAddress, generatePrivateKey } from 'viem/accounts';
import { Resvg } from '@resvg/resvg-js';
import { compile } from './compile.js';
import { fetchStats, packStats } from '../site/stats.js';

export async function renderSvg(client, project, seed, data, deployment) {
  const { abi, bytecode } = compile()[project.renderer];
  const call = { abi, functionName: 'render', args: [BigInt(seed), BigInt(data)] };
  return deployment?.renderer
    ? client.readContract({ ...call, address: deployment.renderer })
    : client.readContract({ ...call, code: bytecode });
}

export function svgToPng(svg, width = 960) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
}

export const today = () => BigInt(Math.floor(Date.now() / 86_400_000));
export const isoDate = (day) => new Date(Number(day) * 86_400_000).toISOString().slice(0, 10);

/** Picks the seed/data for a promotional preview of the project. */
export async function sampleInput(client, project, deployment, cfg, editionAbi) {
  if (project.seedMode === 'perDay') {
    const day = today();
    let seed = 0n;
    if (deployment?.edition) {
      seed = await client.readContract({ address: deployment.edition, abi: editionAbi, functionName: 'daySeed', args: [day] });
    }
    // Not fixed onchain yet (teaser phase, or nobody minted today): a stand-in derived from the date.
    if (seed === 0n) seed = BigInt(keccak256(toHex(`${project.slug}:${day}`)));
    return { seed, data: day, label: isoDate(day) };
  }
  if (project.seedMode === 'perMinter') {
    const list = project.sampleAddresses || [];
    if (!project.stats) {
      const address = list.length ? list[Math.floor(Math.random() * list.length)] : privateKeyToAddress(generatePrivateKey());
      return { seed: BigInt(address), data: 0n, label: address };
    }
    if (list.length) {
      const address = list[Math.floor(Math.random() * list.length)];
      try {
        const stats = await fetchStats(address, cfg.statsHosts, cfg.statsYear);
        return { seed: BigInt(address), data: packStats(stats), label: address };
      } catch (e) {
        console.warn(`stats lookup failed for ${address}: ${e.message}; using synthetic data`);
      }
    }
    const address = privateKeyToAddress(generatePrivateKey());
    const months = Array.from({ length: 12 }, () => Math.floor(Math.random() ** 2 * 120));
    const activeDays = Math.min(365, Math.floor(months.reduce((a, b) => a + b, 0) / 3));
    return { seed: BigInt(address), data: packStats({ months, activeDays }), label: address };
  }
  const seed = BigInt(keccak256(toHex(`${project.slug}:${Date.now()}:${Math.random()}`)));
  if (project.seedMode === 'perSeed') {
    // A sample transaction hash from the project's list, or a random 32-byte value.
    const list = project.sampleSeeds || [];
    const s = list.length ? BigInt(list[Math.floor(Math.random() * list.length)]) : seed;
    return { seed: s, data: s, label: toHex(s, { size: 32 }) };
  }
  return { seed, data: 0n, label: '' };
}
