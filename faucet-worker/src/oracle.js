/**
 * CrypSurance claims oracle — Cloudflare Cron Trigger edition (M2).
 *
 * Reads Policy accounts from the on-chain program and settles them by calling
 * `settle_claim` / `escalate_claim`. It no longer writes memos, and no longer
 * moves tokens itself: the vault is owned by a program PDA, so an approval
 * makes the *program* pay the policy's own holder. This oracle key can decide
 * whether a claim is valid; it cannot decide where the money goes.
 *
 * Cloudflare's scheduler is used rather than GitHub Actions cron, which
 * delayed runs ~16 min on average and skipped enough that real gaps between
 * runs reached 224 minutes.
 *
 * Secrets: DEVNET_KEYPAIR (the oracle key), RPC_URL, AVIATIONSTACK_KEY.
 */

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  escalateClaimIx,
  fetchPolicies,
  poolPda,
  settleClaimIx,
  vaultPda,
} from "./protocol.js";

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const DELAY_THRESHOLD_MIN = 180;

function clean(v, name) {
  if (!v) return v;
  let s = String(v).trim().replace(/^["']|["']$/g, "").trim();
  if (name && s.startsWith(name + "=")) s = s.slice(name.length + 1).trim();
  return s;
}

async function verifyFlight(flight, date, apiKey) {
  if (flight.startsWith("TEST-DELAY"))
    return { delayed: true, basis: "testnet-simulated" };
  if (flight.startsWith("TEST-ONTIME"))
    return { delayed: false, basis: "testnet-simulated" };
  if (!apiKey)
    return { skip: true, reason: "real flight, no AVIATIONSTACK_KEY set" };

  // The free tier rejects the flight_date param, so query by flight number
  // and match the date client-side.
  const url = `https://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flight)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j?.error) {
    return {
      skip: true,
      reason: `flight-data API: ${j.error.code ?? j.error.type ?? "error"}`,
    };
  }
  const recs = Array.isArray(j?.data) ? j.data : [];
  if (recs.length === 0)
    return { skip: true, reason: "flight not found in data feed" };
  const rec = recs.find((r) => r.flight_date === date);
  if (!rec) {
    const seen = [...new Set(recs.map((r) => r.flight_date))].join(", ");
    return {
      skip: true,
      reason: `no record for ${date} yet (feed covers: ${seen || "none"})`,
    };
  }
  const delayMin = Math.max(rec.departure?.delay ?? 0, rec.arrival?.delay ?? 0);
  return {
    delayed: delayMin >= DELAY_THRESHOLD_MIN,
    basis: `aviationstack ${rec.flight_date} delay=${delayMin}min`.slice(0, 64),
  };
}

/** Send + confirm by polling (Workers don't do the websocket path well). */
async function sendAndConfirm(conn, tx, signer) {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { value } = await conn.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) throw new Error(`tx failed: ${JSON.stringify(st.err)}`);
    if (
      st?.confirmationStatus === "confirmed" ||
      st?.confirmationStatus === "finalized"
    ) {
      return sig;
    }
  }
  return sig; // sent; confirmation not observed in time
}

export async function runOracle(env) {
  const log = [];
  const rpc = clean(env.RPC_URL, "RPC_URL") || "https://api.devnet.solana.com";
  const apiKey = clean(env.AVIATIONSTACK_KEY, "AVIATIONSTACK_KEY");
  const conn = new Connection(rpc, { commitment: "confirmed" });

  const oracle = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(clean(env.DEVNET_KEYPAIR, "DEVNET_KEYPAIR")))
  );

  const pool = poolPda();
  const vault = vaultPda(pool);

  const policies = await fetchPolicies(conn);
  const pending = policies.filter((p) => p.status === "requested");
  const awaiting = policies.filter((p) => p.status === "escalated");
  log.push(
    `${policies.length} policies · ${pending.length} pending · ${awaiting.length} awaiting offline verification`
  );

  for (const p of pending) {
    const holderToken = await getAssociatedTokenAddress(
      SURETY_MINT,
      p.holder
    );
    const accounts = {
      oracle: oracle.publicKey,
      pool,
      policy: p.address,
      vault,
      holderToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    const verdict = await verifyFlight(p.flight, p.date, apiKey);

    // Inconclusive data escalates to human verification rather than guessing.
    // On-chain status keeps this to one API call per claim: once escalated the
    // policy is no longer `requested`, so it is never re-checked here.
    if (verdict.skip) {
      const tx = new Transaction().add(
        escalateClaimIx(accounts, verdict.reason.slice(0, 64))
      );
      const sig = await sendAndConfirm(conn, tx, oracle);
      log.push(`? ${p.flight} escalated (${verdict.reason}) ${sig.slice(0, 8)}…`);
      continue;
    }

    const tx = new Transaction().add(
      settleClaimIx(accounts, verdict.delayed, verdict.basis)
    );
    const sig = await sendAndConfirm(conn, tx, oracle);
    log.push(
      `${verdict.delayed ? "✓ paid" : "✗ denied"} ${p.flight} ${p.payout} SURETY [${verdict.basis}] ${sig.slice(0, 8)}…`
    );
  }

  // Heartbeat so the site can show a real "last run".
  if (env.FAUCET_KV) {
    try {
      await env.FAUCET_KV.put(
        "oracle:last-run",
        JSON.stringify({ at: Date.now(), pending: pending.length, log })
      );
    } catch {
      /* non-fatal */
    }
  }
  return log;
}
