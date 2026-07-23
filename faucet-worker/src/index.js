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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Send a POST request." }, 405, origin);
    }

    // ---- validate the wallet address ---------------------------------
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

    // ---- rate limiting (per wallet + per network) --------------------
    const cooldownHours = Number(env.COOLDOWN_HOURS || "8");
    const ttl = Math.max(60, Math.round(cooldownHours * 3600));
    const ipLimit = Number(env.IP_DAILY_LIMIT || "4");
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const addrKey = `addr:${recipient.toBase58()}`;
    const ipKey = `ip:${ip}`;
    let ipCount = 0;

    if (env.FAUCET_KV) {
      const [addrHit, ipHit] = await Promise.all([
        env.FAUCET_KV.get(addrKey),
        env.FAUCET_KV.get(ipKey),
      ]);
      ipCount = ipHit ? Number(ipHit) : 0;
      if (addrHit) {
        return json(
          {
            error: `This wallet already received SURETY. Try again in about ${cooldownHours} hours.`,
          },
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
    }

    // ---- load the signer ---------------------------------------------
    let payer;
    try {
      payer = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(env.DEVNET_KEYPAIR))
      );
    } catch {
      return json({ error: "Faucet is misconfigured (no signer)." }, 500, origin);
    }

    const rpc = (env.RPC_URL || "https://api.devnet.solana.com").trim();
    const amountUi = Math.max(1, Math.round(Number(env.FAUCET_AMOUNT || "2500")));
    const conn = new Connection(rpc, "confirmed");

    try {
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

      // Poll for confirmation instead of confirmTransaction() — the latter
      // opens a WebSocket, which Workers don't support well.
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

      // Only consume the rate-limit budget once the send actually went out.
      if (env.FAUCET_KV) {
        await Promise.all([
          env.FAUCET_KV.put(addrKey, String(Date.now()), { expirationTtl: ttl }),
          env.FAUCET_KV.put(ipKey, String(ipCount + 1), { expirationTtl: ttl }),
        ]);
      }

      return json({ signature, amount: amountUi, confirmed }, 200, origin);
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Faucet error";
      return json({ error: msg.slice(0, 200) }, 500, origin);
    }
  },
};
