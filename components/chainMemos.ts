import type { Connection, PublicKey } from "@solana/web3.js";

/** The JSON memos the protocol writes on-chain (policy, claim, settlement). */
export type ChainMemo = {
  v?: number;
  kind?: string;
  id?: string;
  policy?: string;
  holder?: string;
  flight?: string;
  date?: string;
  payout?: number;
  premium?: number;
  product?: string;
  basis?: string;
  reason?: string;
};

export type MemoRecord = {
  memo: ChainMemo;
  signature: string;
  blockTime: number | null;
};

/**
 * Solana returns memos as `"[len] text"`, and concatenates them when a
 * transaction carries several. Our memos are flat JSON objects, so pull each
 * `{...}` out of the string and parse it.
 */
export function parseMemos(raw: string | null | undefined): ChainMemo[] {
  if (!raw) return [];
  const out: ChainMemo[] = [];
  for (const match of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      out.push(JSON.parse(match[0]) as ChainMemo);
    } catch {
      /* not one of ours */
    }
  }
  return out;
}

/**
 * Read an address's memo history using ONLY `getSignaturesForAddress`, which
 * already includes the memo text — so one RPC call replaces dozens of
 * `getParsedTransaction` calls.
 *
 * This matters: the public devnet RPC rate-limits transaction fetches hard.
 * Batched `getParsedTransactions` 429s immediately at any batch size, and
 * sequential fetches cost ~1.2s each (23 transactions took 26s, and adding
 * concurrency made it fail outright). Reading memos off the signature list
 * does the same job in ~1s per address.
 */
export async function fetchMemoHistory(
  connection: Connection,
  address: PublicKey,
  limit = 100
): Promise<MemoRecord[]> {
  const sigs = await connection.getSignaturesForAddress(address, { limit });
  const out: MemoRecord[] = [];
  for (const s of sigs) {
    for (const memo of parseMemos(s.memo)) {
      out.push({ memo, signature: s.signature, blockTime: s.blockTime ?? null });
    }
  }
  return out;
}

/** Merge memo histories, drop duplicates, and order oldest → newest. */
export function mergeMemoRecords(...lists: MemoRecord[][]): MemoRecord[] {
  const seen = new Set<string>();
  const merged: MemoRecord[] = [];
  for (const list of lists) {
    for (const r of list) {
      const key = `${r.signature}:${r.memo.kind ?? ""}:${r.memo.id ?? r.memo.policy ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }
  return merged.sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));
}
