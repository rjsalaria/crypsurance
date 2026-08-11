/**
 * Shared devnet plumbing for the dApp: the RPC connection, and the two
 * wallet-flow helpers that exist because the obvious approach is wrong in a
 * browser (see each one).
 */

import { Connection, clusterApiUrl } from "@solana/web3.js";
import type { Commitment } from "@solana/web3.js";

/**
 * The dApp's RPC endpoint: the project worker, which holds a dedicated RPC key
 * server-side. Solana's public devnet RPC throttles per IP hard enough that
 * ordinary visitors hit failures just by using the page.
 */
export const DEVNET_RPC =
  "https://crypsurance-faucet.surety.workers.dev/rpc";

/**
 * Connection that prefers the worker RPC but falls back to the public devnet
 * endpoint if it's unreachable or rejects a call — so an outage (or a method
 * outside the worker's allowlist) degrades instead of breaking the page.
 *
 * The fallback is announced once per session. Silent fallback hid a real bug
 * for weeks: the worker's CORS preflight didn't allow web3.js's `solana-client`
 * header, so *every* proxied call failed and every visitor was quietly on the
 * throttled public RPC — the exact thing the proxy exists to prevent. A
 * fallback that works is indistinguishable from a proxy that works unless it
 * says something.
 */
let announcedFallback = false;

/**
 * Methods that cannot go through the worker, and are sent straight to the
 * public endpoint instead of failing there first.
 *
 * getProgramAccounts has nowhere to be proxied to: our paid RPC doesn't serve
 * it, and Solana's public devnet RPC answers Cloudflare's egress IPs with
 * "Your IP or provider is blocked from this endpoint". Routing it through the
 * worker anyway costs a guaranteed-403 round-trip on every policy read and
 * makes the fallback warning below cry wolf. Remove a method from here as soon
 * as an upstream can actually serve it.
 */
const UNPROXYABLE = new Set(["getProgramAccounts"]);

/** JSON-RPC method names in a request body (an array = a batch). */
function methodsIn(init?: RequestInit): string[] {
  try {
    if (typeof init?.body !== "string") return [];
    const body = JSON.parse(init.body);
    return (Array.isArray(body) ? body : [body])
      .map((c) => c?.method)
      .filter((m): m is string => typeof m === "string");
  } catch {
    return [];
  }
}

export const devnetFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const direct = methodsIn(init).some((m) => UNPROXYABLE.has(m));

  if (!direct) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
    } catch {
      /* worker unreachable — fall through */
    }
    if (!announcedFallback) {
      announcedFallback = true;
      console.warn(
        "[crypsurance] RPC proxy unavailable — using the public devnet endpoint, which throttles."
      );
    }
  }
  return fetch(clusterApiUrl("devnet"), init);
};

export function makeDevnetConnection(commitment: Commitment = "confirmed") {
  return new Connection(DEVNET_RPC, { commitment, fetch: devnetFetch });
}

/**
 * Bound how long we wait on a wallet prompt.
 *
 * If the popup is dismissed or never noticed, the adapter's promise can hang
 * indefinitely and leave a button stuck on "Sending…" until the page is
 * reloaded. Time it out instead — but word the failure carefully: the wallet
 * may still complete afterwards, so this must not claim the action failed.
 */
export function withWalletTimeout<T>(p: Promise<T>, ms = 90_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "No response from your wallet. If you did approve it, hit Refresh — the transaction may still have gone through."
          )
        ),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
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
