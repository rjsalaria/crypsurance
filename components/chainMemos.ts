import { Connection, clusterApiUrl } from "@solana/web3.js";
import type { Commitment, PublicKey } from "@solana/web3.js";

/**
 * The dApp's RPC endpoint: the project worker, which holds a dedicated RPC key
 * server-side. Solana's public devnet RPC throttles per IP hard enough that
 * ordinary visitors hit failures just by using the page.
 */
export const DEVNET_RPC =
  "https://crypsurance-faucet.surety.workers.dev/rpc";

/**
 * Connection that prefers the worker RPC but transparently falls back to the
 * public devnet endpoint if it's unreachable or rejects a call — so an outage
 * (or a method outside the worker's allowlist) degrades instead of breaking
 * the whole page.
 */
export const devnetFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  try {
    const res = await fetch(input, init);
    if (res.ok) return res;
  } catch {
    /* worker unreachable — fall through */
  }
  return fetch(clusterApiUrl("devnet"), init);
};

export function makeDevnetConnection(commitment: Commitment = "confirmed") {
  return new Connection(DEVNET_RPC, { commitment, fetch: devnetFetch });
}

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
/** Retry with backoff — the public devnet RPC throttles per IP, so a busy
 *  moment shouldn't surface as a hard failure. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i)); // 0.5s, 1s
      }
    }
  }
  throw lastError;
}

export async function fetchMemoHistory(
  connection: Connection,
  address: PublicKey,
  limit = 100
): Promise<MemoRecord[]> {
  const sigs = await withRetry(() =>
    connection.getSignaturesForAddress(address, { limit })
  );
  const out: MemoRecord[] = [];
  for (const s of sigs) {
    for (const memo of parseMemos(s.memo)) {
      out.push({ memo, signature: s.signature, blockTime: s.blockTime ?? null });
    }
  }
  return out;
}

/**
 * Confirm a transaction by polling its signature status.
 *
 * Do NOT use connection.confirmTransaction with a blockhash captured before
 * the wallet prompt: the user spends time approving, the blockhash expires,
 * and it reports "block height exceeded" for transactions that actually
 * landed — telling someone their purchase failed when it succeeded is the
 * worst possible error, because they buy again.
 *
 * Returns "confirmed" once seen on-chain, or "pending" if it hasn't appeared
 * within the timeout (it may still land — the caller has the signature).
 * Throws only when the chain reports a genuine execution error.
 */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000
): Promise<"confirmed" | "pending"> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const st = value[0];
      if (st?.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
      }
      if (
        st?.confirmationStatus === "confirmed" ||
        st?.confirmationStatus === "finalized"
      ) {
        return "confirmed";
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Transaction failed")) throw e;
      /* transient RPC hiccup — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return "pending";
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
