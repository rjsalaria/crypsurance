/**
 * Minimal client for the CrypSurance Anchor program.
 *
 * Deliberately hand-rolls Anchor's wire format rather than importing
 * @coral-xyz/anchor: this runs inside a Cloudflare Worker alongside the faucet
 * and RPC proxy, where bundle size and cold-start time matter, and the two
 * things we need — an 8-byte discriminator plus Borsh args, and a fixed-layout
 * account to decode — are small and stable.
 *
 * Discriminators are sha256("global:<ix>")[0..8] and
 * sha256("account:<Name>")[0..8]; precomputed so nothing has to hash at
 * runtime. Regenerate them if an instruction is ever renamed.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr"
);

const IX = {
  settle_claim: [205, 203, 21, 66, 255, 231, 209, 155],
  escalate_claim: [96, 28, 94, 195, 201, 64, 213, 181],
};
export const POLICY_DISCRIMINATOR = [222, 135, 7, 163, 235, 177, 33, 68];

/** Status enum, in declaration order. */
export const STATUS = ["active", "requested", "escalated", "paid", "denied"];

export function poolPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID)[0];
}
export function vaultPda(pool) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    PROGRAM_ID
  )[0];
}

/* ---------------------------------------------------------------- */
/* encoding                                                          */
/* ---------------------------------------------------------------- */

function borshString(s) {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return Buffer.from(out);
}

/**
 * Accounts must be in the order the program's context declares them —
 * oracle, pool, policy, vault, holder_token, token_program.
 */
function settleAccounts({ oracle, pool, policy, vault, holderToken, tokenProgram }) {
  return [
    { pubkey: oracle, isSigner: true, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: policy, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: holderToken, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
  ];
}

export function settleClaimIx(accounts, approved, basis) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: settleAccounts(accounts),
    data: concat(
      Uint8Array.from(IX.settle_claim),
      Uint8Array.from([approved ? 1 : 0]),
      borshString(basis)
    ),
  });
}

export function escalateClaimIx(accounts, reason) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: settleAccounts(accounts),
    data: concat(Uint8Array.from(IX.escalate_claim), borshString(reason)),
  });
}

/* ---------------------------------------------------------------- */
/* decoding                                                          */
/* ---------------------------------------------------------------- */

/**
 * Policy layout (after the 8-byte discriminator):
 *   pool 32 | holder 32 | nonce u64 | flight string | date string
 *   | payout u64 | premium u64 | status u8 | created_at i64
 *   | settled_at i64 | basis string | bump u8
 */
export function decodePolicy(data, address) {
  const buf = Buffer.from(data);
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== POLICY_DISCRIMINATOR[i]) return null; // not a Policy
  }
  let o = 8;
  const pubkey = () => {
    const k = new PublicKey(buf.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const u64 = () => {
    const v = buf.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const i64 = () => {
    const v = buf.readBigInt64LE(o);
    o += 8;
    return v;
  };
  const str = () => {
    const len = buf.readUInt32LE(o);
    o += 4;
    const s = buf.subarray(o, o + len).toString("utf8");
    o += len;
    return s;
  };

  const pool = pubkey();
  const holder = pubkey();
  const nonce = u64();
  const flight = str();
  const date = str();
  const payout = u64();
  const premium = u64();
  const status = STATUS[buf[o++]] ?? "unknown";
  const createdAt = i64();
  const settledAt = i64();
  const basis = str();

  return {
    address,
    pool,
    holder,
    nonce,
    flight,
    date,
    payout: Number(payout),
    premium: Number(premium),
    status,
    createdAt: Number(createdAt),
    settledAt: Number(settledAt),
    basis,
  };
}

/**
 * Every policy the program knows about. `getProgramAccounts` filtered by the
 * account discriminator, so other account types (the pool) are excluded
 * server-side rather than fetched and thrown away.
 */
export async function fetchPolicies(connection) {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: Buffer.from(POLICY_DISCRIMINATOR).toString("base64"),
          encoding: "base64",
        },
      },
    ],
  });
  return accounts
    .map((a) => decodePolicy(a.account.data, a.pubkey))
    .filter(Boolean);
}
