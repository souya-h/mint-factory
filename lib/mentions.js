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

const OPT_OUT = /\b(stop|unsubscribe|leave me alone|don'?t (reply|tag|mention))\b|やめて|止めて|不要|いらない|迷惑|ブロック/i;
const ASKS_MINT = /\b(mint|price|cost|when|live|launch|buy|how much)\b|ミント|価格|値段|いくら|いつ|買え|購入/i;
const isJapanese = (text, lang) => lang === 'ja' || /[぀-ヿ一-鿿]/.test(text);
const pick = (list, id) => list[Number(BigInt(id) % BigInt(list.length))];

/**
 * Decides how to answer a mention that names no wallet. Returns { optOut: true }, { text }, or null
 * (leave it for a person). Only short, factual replies: an invitation to send a wallet, or the mint status.
 * Each author gets at most one such reply ever, so a conversation never turns into a bot loop.
 */
export function textReply(m, { project, live, invited, giftsLeft = 0 }) {
  const text = m.text.replace(/@\w+/g, ' ').trim();
  if (OPT_OUT.test(text)) return { optOut: true };
  if (/https?:\/\//.test(text) || invited) return null;
  const ja = isJapanese(text, m.lang);
  if (ASKS_MINT.test(text)) {
    const status = live
      ? ja
        ? [`${project.name}はミント受付中です。1ウォレット1首、リンクはプロフィールから。`, `受付中です。価格は少しずつ上がるので、早い句ほど安いです。リンクはプロフィールに。`]
        : [`${project.name} is open now, one per wallet. Link in bio.`, `It's live. The price steps up as it goes, so early poems cost least. Link in bio.`]
      : project.launch?.short && project.launch.short !== 'later'
        ? ja
          ? [project.launch.noteJa || `ミント開始は${project.launch.short}です。`]
          : [project.launch.note || `Mint opens ${project.launch.short}.`]
        : ja
          ? [`まだ準備中です。始まる日はこのアカウントでお知らせします。`, `ミント開始はもう少し先です。決まったらここで告知します。`]
          : [`Not open yet. The start date will be posted here first.`, `Mint isn't live yet. Watch this account for the date.`];
    return { text: pick(status, m.id) };
  }
  const invite = ja
    ? [`ありがとうございます。ウォレットアドレスか .eth の名前を送ってもらえれば、あなたの一首を詠みます。`, `ウォレットアドレスか .eth 名をリプライで送ると、そのウォレットだけの俳句が返ってきます。`]
    : [`Thank you. Reply with a wallet address or .eth name and I'll read you its haiku.`, `Send a wallet address or .eth name and you'll get the one haiku it holds.`];
  const free = giftsLeft > 0 ? (ja ? `先着${project.giftLimit}名には、そのウォレットに無料で贈ります（残り${giftsLeft}）。` : `The first ${project.giftLimit} get it sent to that wallet free (${giftsLeft} left).`) : '';
  return { text: [pick(invite, m.id), free].filter(Boolean).join(ja ? '' : ' ') };
}
