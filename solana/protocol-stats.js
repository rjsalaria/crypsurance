/**
 * Protocol stats — the grant KPI, measured straight from the chain.
 *
 *   node protocol-stats.js
 *
 * Primary KPI: distinct non-team wallets that complete a full claim lifecycle
 * (buy cover -> file a claim -> receive an on-chain settlement).
 *
 * Reads memos off the signature list, so the whole thing is one RPC call.
 */

require("dotenv").config();
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");

const SURETY_MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const POOL_WALLET = new PublicKey("9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy");
const RPC = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();

const TARGET = 250; // success threshold stated in the grant application

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

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const poolAta = await getAssociatedTokenAddress(SURETY_MINT, POOL_WALLET);
  const sigs = await conn.getSignaturesForAddress(poolAta, { limit: 1000 });

  // Pass 1: policies (id -> holder). Claim memos may appear before their
  // policy in signature order, so holders must be resolved first — doing this
  // in one pass silently undercounts.
  const holderOf = {};
  const all = [];
  for (const s of sigs) {
    for (const m of memosFrom(s.memo)) {
      all.push(m);
      if (m.kind === "policy" && m.id && m.holder) holderOf[m.id] = m.holder;
    }
  }

  // Pass 2: attribute every claim event to its policy's holder.
  const pool = POOL_WALLET.toBase58();
  const bought = new Set();
  const claimed = new Set();
  const settled = new Set();
  let paid = 0;
  let denied = 0;
  let escalated = 0;

  for (const m of all) {
    if (m.kind === "policy" && m.holder) bought.add(m.holder);
    if (!m.policy) continue;
    const h = holderOf[m.policy];
    if (m.kind === "claim-request" && h) claimed.add(h);
    if (m.kind === "claim-paid") {
      paid++;
      if (h) settled.add(h);
    }
    if (m.kind === "claim-denied") {
      denied++;
      if (h) settled.add(h);
    }
    if (m.kind === "verify-request") escalated++;
  }

  const external = (s) => [...s].filter((a) => a && a !== pool);
  const kpi = external(settled).length;
  const pct = Math.min(100, Math.round((kpi / TARGET) * 100));
  const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "·");

  console.log(`\nCrypSurance protocol stats — devnet  (${sigs.length} pool txs)\n`);
  console.log(`  wallets that bought cover        ${external(bought).length}`);
  console.log(`  wallets that filed a claim       ${external(claimed).length}`);
  console.log(`  claims paid / denied / escalated ${paid} / ${denied} / ${escalated}`);
  console.log(`\n  PRIMARY KPI — wallets with a completed claim lifecycle`);
  console.log(`  ${bar}  ${kpi} / ${TARGET}  (${pct}%)`);
  console.log(
    kpi >= TARGET
      ? "\n  ✓ Success threshold met.\n"
      : kpi < 50
        ? `\n  Below the 50-wallet floor — needs real testers, not more features.\n`
        : `\n  On the board. ${TARGET - kpi} to go.\n`
  );
  console.log("  Excludes the team pool wallet. Every figure is on-chain and");
  console.log("  independently verifiable.\n");
})().catch((e) => {
  console.error("Could not read chain:", e.message);
  process.exit(1);
});
