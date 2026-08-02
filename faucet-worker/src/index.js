/**
 * CrypSurance SURETY devnet faucet (Cloudflare Worker).
 *
 * POST { "address": "<devnet wallet>" }
 *   -> transfers FAUCET_AMOUNT SURETY from the pool wallet to that address,
 *      creating its token account if needed, and returns the tx signature.
 *
 * The pool wallet's private key lives ONLY here, as the DEVNET_KEYPAIR secret —
 * never in the website. Rate-limited per wallet and per network via KV.
 *
 * Secrets (wrangler secret put):  DEVNET_KEYPAIR, RPC_URL
 * Vars (wrangler.toml):           FAUCET_AMOUNT, COOLDOWN_HOURS, IP_DAILY_LIMIT
 * KV binding:                     FAUCET_KV (optional but recommended)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { runOracle } from "./oracle.js";

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const DECIMALS = 9n;

const ALLOWED_ORIGINS = new Set([
  "https://crypsurance.io",
  "https://www.crypsurance.io",
  "http://localhost:3000",
  "http://localhost:5050",
]);

function corsHeaders(origin) {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://crypsurance.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Secrets pasted into a terminal sometimes carry surrounding quotes/whitespace
// or an accidental "NAME=" prefix. Clean those so they don't crash the worker.
function cleanStr(v, name) {
  if (!v) return v;
  let s = String(v).trim().replace(/^["']|["']$/g, "").trim();
  if (name && s.startsWith(name + "=")) s = s.slice(name.length + 1).trim();
  return s;
}

async function handle(request, env, origin) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "Send a POST request." }, 405, origin);
  }

  // ---- validate the wallet address -----------------------------------
  let recipient;
  try {
    const body = await request.json();
    recipient = new PublicKey(String(body.address || "").trim());
  } catch {
    return json(
      { error: "That doesn't look like a valid Solana wallet address." },
      400,
      origin
    );
  }

  // ---- load config / signer ------------------------------------------
  const rpc = cleanStr(env.RPC_URL, "RPC_URL") || "https://api.devnet.solana.com";
  const amountUi = Math.max(1, Math.round(Number(env.FAUCET_AMOUNT || "2500")));
  const cooldownHours = Number(env.COOLDOWN_HOURS || "8");
  const ttl = Math.max(60, Math.round(cooldownHours * 3600));
  const ipLimit = Number(env.IP_DAILY_LIMIT || "4");

  let payer;
  try {
    payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(cleanStr(env.DEVNET_KEYPAIR, "DEVNET_KEYPAIR")))
    );
  } catch {
    return json(
      { error: "Faucet signer is misconfigured (check the DEVNET_KEYPAIR secret)." },
      500,
      origin
    );
  }

  // ---- rate limiting (per wallet + per network) ----------------------
  // Never let a KV hiccup crash the faucet — degrade to no-limit instead.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const addrKey = `addr:${recipient.toBase58()}`;
  const ipKey = `ip:${ip}`;
  let ipCount = 0;
  if (env.FAUCET_KV) {
    try {
      const [addrHit, ipHit] = await Promise.all([
        env.FAUCET_KV.get(addrKey),
        env.FAUCET_KV.get(ipKey),
      ]);
      ipCount = ipHit ? Number(ipHit) : 0;
      if (addrHit) {
        return json(
          { error: `This wallet already received SURETY. Try again in about ${cooldownHours} hours.` },
          429,
          origin
        );
      }
      if (ipCount >= ipLimit) {
        return json(
          { error: "Too many requests from your network — try again later." },
          429,
          origin
        );
      }
    } catch {
      /* KV unavailable — proceed without rate limiting */
    }
  }

  // ---- build + send the transfer -------------------------------------
  const conn = new Connection(rpc, { commitment: "confirmed" });
  const fromAta = await getAssociatedTokenAddress(SURETY_MINT, payer.publicKey);
  const toAta = await getAssociatedTokenAddress(SURETY_MINT, recipient);

  const tx = new Transaction();
  const toInfo = await conn.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        toAta,
        recipient,
        SURETY_MINT
      )
    );
  }
  tx.add(
    createTransferInstruction(
      fromAta,
      toAta,
      payer.publicKey,
      BigInt(amountUi) * 10n ** DECIMALS
    )
  );

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const signature = await conn.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
  });

  // Poll for confirmation (confirmTransaction opens a WebSocket, which
  // Workers don't support well).
  let confirmed = false;
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { value } = await conn.getSignatureStatuses([signature]);
    const st = value[0];
    if (st?.err) {
      return json({ error: "The transfer failed on-chain." }, 502, origin);
    }
    if (
      st?.confirmationStatus === "confirmed" ||
      st?.confirmationStatus === "finalized"
    ) {
      confirmed = true;
      break;
    }
  }

  // Consume the rate-limit budget only after the send actually went out.
  if (env.FAUCET_KV) {
    try {
      await Promise.all([
        env.FAUCET_KV.put(addrKey, String(Date.now()), { expirationTtl: ttl }),
        env.FAUCET_KV.put(ipKey, String(ipCount + 1), { expirationTtl: ttl }),
      ]);
    } catch {
      /* ignore rate-limit write failures */
    }
  }

  return json({ signature, amount: amountUi, confirmed }, 200, origin);
}

/**
 * Solana JSON-RPC proxy (POST /rpc).
 *
 * Solana's public devnet RPC throttles per IP hard enough that the dApp fails
 * for ordinary visitors. This forwards read/send calls to the project's own
 * RPC (the RPC_URL secret) so every visitor gets a reliable endpoint while the
 * key stays server-side. Method allowlist + CORS lock keep it from becoming a
 * free public RPC for anyone else.
 */
// NOTE: these are JSON-RPC *wire* method names, which are not always the
// web3.js client method names — e.g. connection.getParsedTokenAccountsByOwner()
// sends "getTokenAccountsByOwner". Getting this wrong makes the dApp silently
// fall back to the public RPC, which is exactly what the proxy exists to avoid.
const RPC_METHODS = new Set([
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getTokenSupply",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getTransaction",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getRecentBlockhash",
  "getFeeForMessage",
  "getMinimumBalanceForRentExemption",
  "sendTransaction",
  "simulateTransaction",
  "getGenesisHash",
  "getEpochInfo",
  "getSlot",
  "getHealth",
  "getVersion",
  "getBlockHeight",
]);

async function handleRpc(request, env, origin) {
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400, origin);
  }
  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) {
    if (!c || !RPC_METHODS.has(c.method)) {
      return json({ error: `method not allowed: ${c && c.method}` }, 403, origin);
    }
  }
  const upstream = cleanStr(env.RPC_URL, "RPC_URL") || "https://api.devnet.solana.com";
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    try {
      const path = new URL(request.url).pathname.replace(/\/+$/, "");
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(origin) });
      }
      if (path === "/rpc") {
        return await handleRpc(request, env, origin);
      }
      // Public heartbeat: when the oracle genuinely last ran. The site reads
      // this instead of GitHub's API (no rate limit, and it reflects the
      // scheduler that actually runs the oracle).
      if (path === "/oracle-status") {
        const raw = env.FAUCET_KV
          ? await env.FAUCET_KV.get("oracle:last-run")
          : null;
        return json(raw ? JSON.parse(raw) : { at: null }, 200, origin);
      }
      // Manual trigger, handy for demos and for verifying a deploy.
      if (path === "/run-oracle") {
        const log = await runOracle(env);
        return json({ ok: true, log }, 200, origin);
      }
      return await handle(request, env, origin);
    } catch (e) {
      // Never surface a raw Cloudflare 1101 — return the real reason instead.
      const msg = e && e.message ? String(e.message) : String(e);
      return json({ error: `Faucet error: ${msg}`.slice(0, 300) }, 500, origin);
    }
  },

  /**
   * Cron Trigger (see [triggers] in wrangler.toml). Cloudflare fires this on
   * schedule reliably, unlike GitHub Actions cron, which delayed our runs by
   * ~16 min on average and skipped enough that real gaps hit 224 minutes.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runOracle(env).catch((e) => {
        console.error("oracle run failed:", e && e.message ? e.message : e);
      })
    );
  },
};
