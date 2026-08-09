/**
 * Protocol stats — the grant KPI, measured straight from the chain.
 *
 *   node protocol-stats.js
 *
 * Primary KPI: distinct non-team wallets that complete a full claim lifecycle
 * (buy cover -> file a claim -> receive an on-chain settlement).
 *
 * Reads Policy accounts from the program. Policy status is a field the program
 * writes, so nothing here is inferred from an event stream — an earlier
 * memo-based version had to reconstruct status by replaying history, and
 * silently undercounted when events arrived out of order.
 *
 * Note: this uses the PUBLIC devnet RPC deliberately. getProgramAccounts is
 * the one call Helius does not serve, so RPC_URL is ignored here.
 */

const { Connection, PublicKey } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr");
/** Team wallets, excluded from the KPI so our own testing can't inflate it. */
const TEAM = new Set([
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy", // treasury / oracle
  "7SEo9AVxa7gHYHvDXq9a2Zpj5MgDWK1eX5XhH6mUuxBD", // deploy authority
]);

const POLICY_DISCRIMINATOR = [222, 135, 7, 163, 235, 177, 33, 68];
const STATUS = ["active", "requested", "escalated", "paid", "denied"];
const TARGET = 250; // success threshold stated in the grant application

const RPC = "https://api.devnet.solana.com";

/** base58 of a short byte array — memcmp filters take base58, not base64. */
function bs58(bytes) {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = A[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

function decodePolicy(data) {
  for (let i = 0; i < 8; i++) if (data[i] !== POLICY_DISCRIMINATOR[i]) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dec = new TextDecoder();
  let o = 8;
  const key = () => {
    const k = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const u64 = () => {
    const v = view.getBigUint64(o, true);
    o += 8;
    return v;
  };
  const str = () => {
    const l = view.getUint32(o, true);
    o += 4;
    const s = dec.decode(data.subarray(o, o + l));
    o += l;
    return s;
  };
  key(); // pool
  const holder = key().toBase58();
  u64(); // nonce
  const flight = str();
  str(); // date
  const payout = Number(u64());
  const premium = Number(u64());
  const status = STATUS[data[o]] ?? "unknown";
  return { holder, flight, payout, premium, status };
}

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58(POLICY_DISCRIMINATOR) } }],
  });

  const policies = accounts
    .map((a) => decodePolicy(new Uint8Array(a.account.data)))
    .filter(Boolean);

  const external = (h) => !TEAM.has(h);
  const bought = new Set(policies.filter((p) => external(p.holder)).map((p) => p.holder));
  const claimed = new Set(
    policies
      .filter((p) => external(p.holder) && p.status !== "active")
      .map((p) => p.holder)
  );
  const completed = new Set(
    policies
      .filter((p) => external(p.holder) && (p.status === "paid" || p.status === "denied"))
      .map((p) => p.holder)
  );

  const count = (s) => policies.filter((p) => p.status === s).length;
  const paidOut = policies
    .filter((p) => p.status === "paid")
    .reduce((n, p) => n + p.payout, 0);

  const kpi = completed.size;
  const pct = Math.min(100, Math.round((kpi / TARGET) * 100));
  const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "·");

  console.log(`\nCrypSurance protocol stats — devnet  (${policies.length} policies on-chain)\n`);
  console.log(`  wallets that bought cover        ${bought.size}`);
  console.log(`  wallets that filed a claim       ${claimed.size}`);
  console.log(
    `  claims paid / denied / escalated ${count("paid")} / ${count("denied")} / ${count("escalated")}`
  );
  console.log(`  SURETY paid out                  ${paidOut.toLocaleString()}`);
  console.log(`\n  PRIMARY KPI — wallets with a completed claim lifecycle`);
  console.log(`  ${bar}  ${kpi} / ${TARGET}  (${pct}%)`);
  console.log(
    kpi >= TARGET
      ? "\n  ✓ Success threshold met.\n"
      : kpi < 50
        ? `\n  Below the 50-wallet floor — needs real testers, not more features.\n`
        : `\n  On the board. ${TARGET - kpi} to go.\n`
  );
  console.log("  Excludes team wallets. Every figure is a Policy account on");
  console.log("  devnet and independently verifiable.\n");
})().catch((e) => {
  console.error("Could not read chain:", e.message);
  process.exit(1);
});
