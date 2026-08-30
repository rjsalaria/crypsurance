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
const { Connection, SYSVAR_CLOCK_PUBKEY } = require("@solana/web3.js");

// Solana's public devnet RPC limits per IP over a rolling ~10s window, and the
// oracle job runs three operator passes back to back from one runner. The
// third pass is the one that crosses the line, which is why this only ever
// failed as operator B. Backing off for six seconds was never going to clear a
// ten second window, so 429 waits longer than a transport blip does.
const RETRIES = 6;
const BASE_DELAY_MS = 400;
const RATE_LIMIT_BASE_MS = 2_000;
const MAX_DELAY_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Honour Retry-After when the server sends one; it knows better than we do. */
function retryAfterMs(res) {
  const h = res?.headers?.get?.("retry-after");
  if (!h) return 0;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_DELAY_MS);
  const at = Date.parse(h);
  return Number.isNaN(at) ? 0 : Math.min(Math.max(at - Date.now(), 0), MAX_DELAY_MS);
}

async function retryingFetch(input, init) {
  let lastErr;
  let wait = 0;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      // Jitter, so three passes that hit the limit together do not then retry
      // in lockstep and hit it together again.
      await sleep(wait + Math.floor(Math.random() * 250));
    }
    try {
      const res = await fetch(input, init);
      // 429 is rate limiting; 5xx is the endpoint failing. Both are worth
      // asking again. Anything else is our problem, not the network's.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`RPC responded ${res.status}`);
        const base = res.status === 429 ? RATE_LIMIT_BASE_MS : BASE_DELAY_MS;
        wait = Math.min(
          Math.max(retryAfterMs(res), base * 2 ** attempt),
          MAX_DELAY_MS
        );
        continue;
      }
      return res;
    } catch (e) {
      // Transport-level: socket closed, DNS, TLS. `fetch failed` lives here.
      lastErr = e;
      wait = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    }
  }
  throw lastErr;
}

/**
 * The cluster's own idea of the time, in seconds.
 *
 * Every window in the program is checked against Clock::get(), which is derived
 * from slot progression and drifts behind wall time -- on devnet by a minute or
 * more. Deciding locally that a commit window has closed and then acting on it
 * is how you get CommitWindowOpen back from a program that is simply still
 * living in the past. Ask the chain instead.
 *
 * unix_timestamp is the fifth field of the Clock sysvar: slot u64,
 * epoch_start_timestamp i64, epoch u64, leader_schedule_epoch u64, then it --
 * so it starts at byte 32.
 */
async function chainNow(connection) {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!info) throw new Error("could not read the clock sysvar");
  return Number(info.data.readBigInt64LE(32));
}

/** Block until the cluster's clock passes `deadline`, reporting as it waits. */
async function waitForChainTime(connection, deadline, label = "window") {
  for (;;) {
    const now = await chainNow(connection);
    const left = deadline - now;
    if (left <= 0) return now;
    console.log(`   ${label}: ${left}s left by the chain's clock…`);
    await sleep(Math.min(left, 30) * 1000 + 1000);
  }
}

/** A `confirmed` Connection to `rpc` that retries transient failures. */
function makeConnection(rpc, commitment = "confirmed") {
  return new Connection(rpc, { commitment, fetch: retryingFetch });
}

module.exports = { makeConnection, retryingFetch, chainNow, waitForChainTime };
