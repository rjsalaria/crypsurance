/**
 * CrypSurance claims oracle — Cloudflare Cron Trigger edition.
 *
 * Same job as solana/process-claims.js, but driven by Cloudflare's scheduler
 * instead of GitHub Actions. GitHub treats cron as best-effort: it delayed our
 * scheduled runs by ~16 minutes on average and skipped enough of them that the
 * real gap between runs ranged from 64 to 224 minutes. Cloudflare fires on
 * time, which is what makes "settles every 30 minutes" actually true.
 *
 * Reads state from the pool token account's memo history, verifies each pending
 * claim, and pays / denies / escalates on-chain.
 *
 * Secrets: DEVNET_KEYPAIR, RPC_URL, AVIATIONSTACK_KEY (optional).
 */

import { Buffer } from "node:buffer";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const POOL_WALLET = new PublicKey(
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy"
);
// Memo v1 — v2 is not deployed on devnet
const MEMO_PROGRAM = new PublicKey(
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"
);
const DECIMALS = 9n;
const DELAY_THRESHOLD_MIN = 180;

function clean(v, name) {
  if (!v) return v;
  let s = String(v).trim().replace(/^["']|["']$/g, "").trim();
  if (name && s.startsWith(name + "=")) s = s.slice(name.length + 1).trim();
  return s;
}

/** Memos ride along on the signature list — no transaction fetches needed. */
function memosFrom(raw) {
  if (!raw) return [];
  const out = [];
  for (const m of String(raw).matchAll(/\{[^{}]*\}/g)) {
    try {
      out.push(JSON.parse(m[0]));
    } catch {
      /* not ours */
    }
  }
  return out;
}

async function verifyFlight(flight, date, apiKey) {
  if (flight.startsWith("TEST-DELAY"))
    return { delayed: true, basis: "testnet-simulated" };
  if (flight.startsWith("TEST-ONTIME"))
    return { delayed: false, basis: "testnet-simulated" };
  if (!apiKey)
    return { skip: true, reason: "real flight, no AVIATIONSTACK_KEY set" };

  // Free tier rejects the flight_date param, so query by flight number and
  // match the date client-side.
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
    return { skip: true, reason: `no record for ${date} yet (feed covers: ${seen || "none"})` };
  }
  const delayMin = Math.max(rec.departure?.delay ?? 0, rec.arrival?.delay ?? 0);
  return {
    delayed: delayMin >= DELAY_THRESHOLD_MIN,
    basis: `aviationstack ${rec.flight_date} delay=${delayMin}min`,
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
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
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

  const pool = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(clean(env.DEVNET_KEYPAIR, "DEVNET_KEYPAIR")))
  );
  if (!pool.publicKey.equals(POOL_WALLET)) {
    throw new Error("DEVNET_KEYPAIR is not the pool wallet");
  }
  const poolAta = await getAssociatedTokenAddress(SURETY_MINT, POOL_WALLET);

  // One call gives the whole state: memos come back on the signature list.
  const sigs = await conn.getSignaturesForAddress(poolAta, { limit: 1000 });
  const policies = new Map();
  const requests = new Set();
  const settled = new Set();
  const escalated = new Set();

  for (let i = sigs.length - 1; i >= 0; i--) {
    for (const m of memosFrom(sigs[i].memo)) {
      if (m.kind === "policy" && m.flight && m.id) policies.set(m.id, m);
      else if (m.kind === "claim-request" && m.policy) requests.add(m.policy);
      else if ((m.kind === "claim-paid" || m.kind === "claim-denied") && m.policy)
        settled.add(m.policy);
      else if (m.kind === "verify-request" && m.policy) escalated.add(m.policy);
    }
  }

  const pending = [...requests].filter((id) => !settled.has(id) && policies.has(id));
  log.push(`scanned ${sigs.length} txs · policies ${policies.size} · pending ${pending.length}`);

  for (const id of pending) {
    const p = policies.get(id);
    const holder = new PublicKey(p.holder);
    const holderAta = await getAssociatedTokenAddress(SURETY_MINT, holder);

    // Already escalated: never re-hit the paid flight API for it.
    if (escalated.has(id)) {
      log.push(`~ ${id} awaiting offline verification`);
      continue;
    }

    const verdict = await verifyFlight(p.flight, p.date, apiKey);

    if (verdict.skip) {
      const memo = JSON.stringify({
        v: 2, kind: "verify-request", policy: id,
        flight: p.flight, date: p.date, reason: verdict.reason,
      });
      const tx = new Transaction().add(
        new TransactionInstruction({
          // both accounts so it shows in the public console AND the holder's wallet
          keys: [
            { pubkey: poolAta, isSigner: false, isWritable: false },
            { pubkey: holderAta, isSigner: false, isWritable: false },
          ],
          programId: MEMO_PROGRAM,
          data: Buffer.from(memo, "utf8"),
        })
      );
      const sig = await sendAndConfirm(conn, tx, pool);
      log.push(`? ${id} escalated (${verdict.reason}) ${sig.slice(0, 8)}…`);
      continue;
    }

    const memo = JSON.stringify({
      v: 2,
      kind: verdict.delayed ? "claim-paid" : "claim-denied",
      policy: id,
      flight: p.flight,
      basis: verdict.basis,
    });
    const tx = new Transaction();
    if (verdict.delayed) {
      if (!(await conn.getAccountInfo(holderAta))) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            pool.publicKey, holderAta, holder, SURETY_MINT
          )
        );
      }
      tx.add(
        createTransferInstruction(
          poolAta, holderAta, pool.publicKey,
          BigInt(p.payout) * 10n ** DECIMALS
        )
      );
      tx.add(
        new TransactionInstruction({
          keys: [], programId: MEMO_PROGRAM, data: Buffer.from(memo, "utf8"),
        })
      );
    } else {
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: poolAta, isSigner: false, isWritable: false },
            { pubkey: holderAta, isSigner: false, isWritable: false },
          ],
          programId: MEMO_PROGRAM,
          data: Buffer.from(memo, "utf8"),
        })
      );
    }
    const sig = await sendAndConfirm(conn, tx, pool);
    log.push(
      `${verdict.delayed ? "✓ paid" : "✗ denied"} ${id} [${verdict.basis}] ${sig.slice(0, 8)}…`
    );
  }

  // Heartbeat so the site can show a real "last run" without GitHub's API.
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
