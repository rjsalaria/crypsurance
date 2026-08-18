/**
 * Browser client for the CrypSurance Anchor program.
 *
 * Hand-rolls Anchor's wire format (8-byte discriminator + Borsh args) instead
 * of shipping @coral-xyz/anchor to the browser: the app only needs two
 * instructions and one account layout, and the Anchor runtime would add a
 * large dependency to every page load for no benefit.
 *
 * All 64-bit reads and writes go through DataView rather than Buffer's
 * writeBigUInt64LE / readBigUInt64LE. Those exist in Node but NOT in the
 * Buffer polyfill browsers get, so using them fails at runtime with
 * "writeBigUInt64LE is not a function" — in the wallet flow specifically,
 * which is the one path that cannot be exercised outside a browser.
 *
 * Discriminators are sha256("global:<ix>")[0..8] / sha256("account:<Name>")[0..8],
 * precomputed. Regenerate if an instruction is renamed.
 */

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr"
);
export const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const IX_BUY_COVER = [43, 59, 234, 123, 199, 21, 0, 167];
const IX_FILE_CLAIM = [187, 254, 40, 13, 146, 223, 230, 97];
const POLICY_DISCRIMINATOR = [222, 135, 7, 163, 235, 177, 33, 68];

/** Declaration order of PolicyStatus in the program. */
const STATUS = ["active", "requested", "escalated", "paid", "denied"] as const;
export type PolicyStatus = (typeof STATUS)[number];

export type OnChainPolicy = {
  address: string;
  holder: string;
  nonce: bigint;
  flight: string;
  date: string;
  payout: number;
  premium: number;
  status: PolicyStatus;
  createdAt: number;
  settledAt: number;
  basis: string;
};

/* ---------------------------------------------------------------- */
/* little-endian primitives (DataView — works in every runtime)      */
/* ---------------------------------------------------------------- */

function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function concat(parts: Uint8Array[]): Buffer {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return Buffer.from(out);
}

/** Borsh string: u32 little-endian length, then UTF-8 bytes. */
function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat([u32le(bytes.length), bytes]);
}

/**
 * Retry with backoff. The devnet RPC throttles per IP, so a busy moment
 * shouldn't surface to a visitor as a hard failure — these reads are
 * idempotent, and one retry usually gets through.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i)); // 0.5s, 1s
      }
    }
  }
  throw lastError;
}

/* ---------------------------------------------------------------- */
/* addresses                                                         */
/* ---------------------------------------------------------------- */

export function poolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID)[0];
}
export function vaultPda(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    PROGRAM_ID
  )[0];
}
export function policyPda(holder: PublicKey, nonce: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), holder.toBuffer(), Buffer.from(u64le(nonce))],
    PROGRAM_ID
  )[0];
}
/** Where a claim's attestations are counted. Opened by file_claim. */
export function tallyPda(policy: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tally"), policy.toBuffer()],
    PROGRAM_ID
  )[0];
}

/* ---------------------------------------------------------------- */
/* instructions                                                      */
/* ---------------------------------------------------------------- */

export function buyCoverIx(params: {
  holder: PublicKey;
  holderToken: PublicKey;
  nonce: bigint;
  flight: string;
  date: string;
  payout: number;
}): TransactionInstruction {
  const pool = poolPda();
  const vault = vaultPda(pool);
  const policy = policyPda(params.holder, params.nonce);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.holder, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: policy, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: params.holderToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat([
      Uint8Array.from(IX_BUY_COVER),
      u64le(params.nonce),
      borshString(params.flight),
      borshString(params.date),
      u64le(BigInt(params.payout)),
    ]),
  });
}

/**
 * File a claim, which also opens the account its attestations are counted in.
 *
 * The holder is writable because they pay that account's rent. Filing is the
 * right moment to create it: attesting then stays a pure vote, and an operator
 * never pays for a claim it did not make.
 */
export function fileClaimIx(
  holder: PublicKey,
  policy: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: holder, isSigner: true, isWritable: true },
      { pubkey: policy, isSigner: false, isWritable: true },
      { pubkey: tallyPda(policy), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(Uint8Array.from(IX_FILE_CLAIM)),
  });
}

/* ---------------------------------------------------------------- */
/* decoding                                                          */
/* ---------------------------------------------------------------- */

/**
 * Layout after the discriminator:
 *   pool 32 | holder 32 | nonce u64 | flight str | date str | payout u64
 *   | premium u64 | status u8 | created_at i64 | settled_at i64 | basis str | bump u8
 */
export function decodePolicy(
  data: Uint8Array,
  address: PublicKey
): OnChainPolicy | null {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== POLICY_DISCRIMINATOR[i]) return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let o = 8;

  const key = () => {
    const k = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const readU64 = () => {
    const v = view.getBigUint64(o, true);
    o += 8;
    return v;
  };
  const readI64 = () => {
    const v = view.getBigInt64(o, true);
    o += 8;
    return v;
  };
  const readStr = () => {
    const len = view.getUint32(o, true);
    o += 4;
    const s = decoder.decode(data.subarray(o, o + len));
    o += len;
    return s;
  };

  key(); // pool — not needed by the UI
  const holder = key();
  const nonce = readU64();
  const flight = readStr();
  const date = readStr();
  const payout = Number(readU64());
  const premium = Number(readU64());
  const status = STATUS[data[o++]] ?? "active";
  const createdAt = Number(readI64());
  const settledAt = Number(readI64());
  const basis = readStr();

  return {
    address: address.toBase58(),
    holder: holder.toBase58(),
    nonce,
    flight,
    date,
    payout,
    premium,
    status,
    createdAt,
    settledAt,
    basis,
  };
}

/**
 * Policies belonging to one wallet. Filtered server-side by the account
 * discriminator and the holder field (offset 8 + 32), so the RPC returns only
 * this wallet's policies rather than every account the program owns.
 */
export async function fetchPolicies(
  connection: Connection,
  holder: PublicKey
): Promise<OnChainPolicy[]> {
  const accounts = await withRetry(() =>
    connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58FromBytes(POLICY_DISCRIMINATOR) } },
        { memcmp: { offset: 40, bytes: holder.toBase58() } },
      ],
    })
  );
  return accounts
    .map((a) => decodePolicy(new Uint8Array(a.account.data), a.pubkey))
    .filter((p): p is OnChainPolicy => p !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Every policy the program holds, for public views (protocol stats, the
 * verifier console). Filtered to Policy accounts server-side.
 */
export async function fetchAllPolicies(
  connection: Connection
): Promise<OnChainPolicy[]> {
  const accounts = await withRetry(() =>
    connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58FromBytes(POLICY_DISCRIMINATOR) } },
      ],
    })
  );
  return accounts
    .map((a) => decodePolicy(new Uint8Array(a.account.data), a.pubkey))
    .filter((p): p is OnChainPolicy => p !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * base58 for a short byte array (memcmp filters take base58, not base64).
 * Exported so the tests can check it against a reference encoder — a wrong
 * filter doesn't error, it just returns no accounts.
 */
export function bs58FromBytes(bytes: number[]): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}
