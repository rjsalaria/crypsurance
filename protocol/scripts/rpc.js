/**
 * A Connection that survives the public RPC dropping a request.
 *
 * The oracle runs on GitHub's cron against Solana's public devnet endpoint,
 * which is rate limited and occasionally just closes the socket — the failure
 * surfaces as a bare `TypeError: fetch failed` from inside web3.js, several
 * layers below anything we call directly. Left alone it aborts the whole run,
 * and because the run is what settles claims, one dropped packet stalls every
 * open claim until the next scheduled run half an hour later.
 *
 * Retrying at the fetch layer rather than around each call is deliberate: the
 * failures happen inside web3.js and Anchor internals we do not drive, so this
 * is the only seam that covers all of them.
 *
 * Only transport failures and the RPC's own overload responses are retried.
 * A 4xx means we asked for something wrong and asking again will not fix it.
 */
const { Connection } = require("@solana/web3.js");

const RETRIES = 4;
const BASE_DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryingFetch(input, init) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff. The public endpoint rate limits per IP, and a
      // hot retry loop is how you turn a blip into a ban.
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      const res = await fetch(input, init);
      // 429 is rate limiting; 5xx is the endpoint failing. Both are worth
      // asking again. Anything else is our problem, not the network's.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`RPC responded ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      // Transport-level: socket closed, DNS, TLS. `fetch failed` lives here.
      lastErr = e;
    }
  }
  throw lastErr;
}

/** A `confirmed` Connection to `rpc` that retries transient failures. */
function makeConnection(rpc, commitment = "confirmed") {
  return new Connection(rpc, { commitment, fetch: retryingFetch });
}

module.exports = { makeConnection, retryingFetch };
