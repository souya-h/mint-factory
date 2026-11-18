// Replies to mentions of the label's account with the sender's own artwork.
// X allows automated replies through the API when the person mentioned the account first,
// so only mentions are answered, never search results or other people's threads.
import { createPublicClient, http, getAddress, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

/** Finds the wallet a mention refers to: a 0x address, or an ENS / Basename name. */
export function parseTarget(text) {
  const addr = text.match(/0x[a-fA-F0-9]{40}\b/);
  if (addr && isAddress(addr[0], { strict: false })) return { address: getAddress(addr[0].toLowerCase()) };
  const name = text.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)\b/i);
  if (name) return { name: name[1].toLowerCase() };
  return null;
}

let ens;
/** Resolves an ENS name (including name.base.eth via ENS offchain lookup). Returns null if it has no address. */
export async function resolveName(name) {
  ens ??= createPublicClient({ chain: mainnet, transport: http(process.env.MAINNET_RPC_URL || undefined) });
  try {
    return await ens.getEnsAddress({ name: normalize(name) });
  } catch {
    return null;
  }
}

export const shortAddress = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
