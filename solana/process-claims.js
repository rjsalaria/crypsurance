/**
 * Testnet claims oracle operator (M3/M4 v1 — centralized by design, honestly).
 *
 * Scans the pool's SURETY account for on-chain policy + claim-request memos,
 * verifies each pending claim, and pays approved payouts from the pool wallet
 * with the verification recorded on-chain.
 *
 * Verification rules:
 *   - flight starting TEST-DELAY  -> approved (instant, for testnet demos)
 *   - flight starting TEST-ONTIME -> denied
 *   - real flight numbers          -> checked via aviationstack when
 *                                     AVIATIONSTACK_KEY is set in .env,
 *                                     otherwise skipped with a note
 *
 * When a claim cannot be verified from data (unknown flight, no API key),
 * --pay records an on-chain verification request instead — the Verifier
 * Network portal (/verify) lists these for partner / community follow-up,
 * and the operator settles them manually after offline verification:
 *
 * Usage:
 *   node process-claims.js            (dry run — shows what it would do)
 *   node process-claims.js --pay      (pay/deny/escalate on-chain)
 *   node process-claims.js --resolve CSD-XXXX --delayed yes --basis partner:AirlineDesk
 *                                     (manual settlement after offline verification)
 *
 * Env (.env): KEYPAIR_PATH or PRIVATE_KEY (pool wallet), RPC_URL,
 *             optional AVIATIONSTACK_KEY.
 */

require("dotenv").config();
const fs = require("fs");
const bs58 = require("bs58");
const {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  createTransferInstruction, getAssociatedTokenAddress,
} = require("@solana/spl-token");

const SURETY_MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const POOL_WALLET = new PublicKey("9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy");
// Memo v1 (v2 is not currently deployed on devnet)
const MEMO_PROGRAM = new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");
const DECIMALS = 9n;
const PAY = process.argv.includes("--pay");
const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const RESOLVE_ID = argValue("--resolve");
const RESOLVE_DELAYED = argValue("--delayed"); // yes | no
const RESOLVE_BASIS = argValue("--basis") || "offline-verification";

function loadSecretKey() {
  if (process.env.KEYPAIR_PATH) {
    return Uint8Array.from(JSON.parse(fs.readFileSync(process.env.KEYPAIR_PATH, "utf8")));
  }
  if (process.env.PRIVATE_KEY) return bs58.decode(process.env.PRIVATE_KEY);
  throw new Error("Set KEYPAIR_PATH or PRIVATE_KEY in solana/.env");
}

async function verifyFlight(flight, date) {
  if (flight.startsWith("TEST-DELAY")) return { delayed: true, basis: "testnet-simulated" };
  if (flight.startsWith("TEST-ONTIME")) return { delayed: false, basis: "testnet-simulated" };
  const key = process.env.AVIATIONSTACK_KEY;
  if (!key) return { skip: true, reason: "real flight, no AVIATIONSTACK_KEY set" };
  // free tier rejects the flight_date param (function_access_restricted),
  // so query by flight number only and match the date client-side
  const url = `https://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${encodeURIComponent(flight)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j?.error) {
    return { skip: true, reason: `flight-data API: ${j.error.code ?? j.error.type ?? "error"}` };
  }
  const recs = Array.isArray(j?.data) ? j.data : [];
  if (recs.length === 0) return { skip: true, reason: "flight not found in data feed" };
  const rec = recs.find((r) => r.flight_date === date) ?? null;
  if (!rec) {
    return {
      skip: true,
      reason: `no record for ${date} yet (feed covers: ${[...new Set(recs.map((r) => r.flight_date))].join(", ") || "none"})`,
    };
  }
  const delayMin = Math.max(rec.departure?.delay ?? 0, rec.arrival?.delay ?? 0);
  return { delayed: delayMin >= 180, basis: `aviationstack ${rec.flight_date} delay=${delayMin}min` };
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const pool = Keypair.fromSecretKey(loadSecretKey());
  if (!pool.publicKey.equals(POOL_WALLET)) {
    throw new Error("Loaded keypair is not the pool wallet");
  }
  const poolAta = await getAssociatedTokenAddress(SURETY_MINT, POOL_WALLET);

  console.log(`Mode: ${PAY ? "PAY (writes to chain)" : "dry run (add --pay to execute)"}`);
  const sigs = await conn.getSignaturesForAddress(poolAta, { limit: 100 });
  const txs = [];
  for (const s of sigs) {
    txs.push(
      await conn.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
  }

  const policies = new Map();
  const requests = new Map();
  const settled = new Set();
  const escalated = new Set();

  for (let i = txs.length - 1; i >= 0; i--) {
    const tx = txs[i];
    if (!tx) continue;
    for (const ix of tx.transaction.message.instructions) {
      if (!("program" in ix) || ix.program !== "spl-memo") continue;
      try {
        const m = JSON.parse(ix.parsed);
        if (m.kind === "policy" && m.flight) policies.set(m.id, m);
        else if (m.kind === "claim-request") requests.set(m.policy, m);
        else if (m.kind === "claim-paid" || m.kind === "claim-denied") settled.add(m.policy);
        else if (m.kind === "verify-request") escalated.add(m.policy);
      } catch {}
    }
  }

  async function settle(p, delayed, basis) {
    const memo = JSON.stringify({
      v: 2,
      kind: delayed ? "claim-paid" : "claim-denied",
      policy: p.id,
      flight: p.flight,
      basis,
    });
    const tx = new Transaction();
    if (delayed) {
      const holderAta = await getAssociatedTokenAddress(SURETY_MINT, new PublicKey(p.holder));
      tx.add(createTransferInstruction(poolAta, holderAta, pool.publicKey, BigInt(p.payout) * 10n ** DECIMALS));
      tx.add(new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: Buffer.from(memo, "utf8") }));
    } else {
      tx.add(new TransactionInstruction({
        keys: [{ pubkey: poolAta, isSigner: false, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(memo, "utf8"),
      }));
    }
    const sig = await sendAndConfirmTransaction(conn, tx, [pool]);
    console.log(`  -> settled: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }

  // ---- manual resolution mode (after offline / partner verification) ----
  if (RESOLVE_ID) {
    const p = policies.get(RESOLVE_ID);
    if (!p) throw new Error(`Policy ${RESOLVE_ID} not found in recent pool activity`);
    if (settled.has(RESOLVE_ID)) throw new Error(`Policy ${RESOLVE_ID} is already settled`);
    if (RESOLVE_DELAYED !== "yes" && RESOLVE_DELAYED !== "no") {
      throw new Error("Pass --delayed yes|no with --resolve");
    }
    const delayed = RESOLVE_DELAYED === "yes";
    console.log(`Manual resolution: ${RESOLVE_ID} -> ${delayed ? "APPROVE" : "DENY"} [${RESOLVE_BASIS}]${PAY ? "" : " (dry run — add --pay)"}`);
    if (PAY) await settle(p, delayed, RESOLVE_BASIS);
    console.log("\ndone");
    return;
  }

  const pending = [...requests.keys()].filter((id) => !settled.has(id) && policies.has(id));
  console.log(`policies: ${policies.size} | claim requests: ${requests.size} | pending: ${pending.length} | awaiting offline verification: ${[...escalated].filter((id) => !settled.has(id)).length}\n`);

  for (const id of pending) {
    const p = policies.get(id);

    // Already escalated to human verification — do NOT call the flight-data
    // API again. This bounds paid-API usage to at most one call per real
    // flight claim (TEST-* flights never hit the API), so the schedule
    // frequency cannot burn the free-tier quota.
    if (escalated.has(id)) {
      console.log(`~ ${id} (${p.flight} ${p.date}) awaiting offline verification`);
      continue;
    }

    const verdict = await verifyFlight(p.flight, p.date);

    if (verdict.skip) {
      console.log(`? ${id} (${p.flight} ${p.date}) -> ESCALATE to Verifier Network: ${verdict.reason}${PAY ? "" : " (dry run)"}`);
      if (!PAY) continue;
      const memo = JSON.stringify({
        v: 2,
        kind: "verify-request",
        policy: id,
        flight: p.flight,
        date: p.date,
        reason: verdict.reason,
      });
      const tx = new Transaction().add(
        new TransactionInstruction({
          keys: [{ pubkey: poolAta, isSigner: false, isWritable: false }],
          programId: MEMO_PROGRAM,
          data: Buffer.from(memo, "utf8"),
        })
      );
      const sig = await sendAndConfirmTransaction(conn, tx, [pool]);
      console.log(`  -> verification request recorded: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      continue;
    }

    const action = verdict.delayed ? "APPROVE" : "DENY";
    console.log(`${verdict.delayed ? "✓" : "✗"} ${id} (${p.flight} ${p.date}) -> ${action} [${verdict.basis}]${PAY ? "" : " (dry run)"}`);
    if (!PAY) continue;
    await settle(p, verdict.delayed, verdict.basis);
  }
  console.log("\ndone");
}

const WATCH = process.argv.includes("--watch");
const INTERVAL_MIN = Number(argValue("--interval") ?? 5);

if (WATCH) {
  (async () => {
    console.log(`Watch mode: checking claims every ${INTERVAL_MIN} min (Ctrl+C to stop)\n`);
    for (;;) {
      try {
        await main();
      } catch (e) {
        console.error(`[${new Date().toLocaleTimeString()}] cycle failed: ${e.message}`);
      }
      console.log(`\n[${new Date().toLocaleTimeString()}] next check in ${INTERVAL_MIN} min…\n`);
      await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    }
  })();
} else {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
