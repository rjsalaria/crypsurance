/**
 * Browser client for the CrypSurance Anchor program.
 *
 * Hand-rolls Anchor's wire format (8-byte discriminator + Borsh args) instead
 * of shipping @coral-xyz/anchor to the browser: the app only needs two
 * instructions and one account layout, and the Anchor runtime would add a
 * large dependency to every page load for no benefit.
 *
 * Discriminators are sha256("global:<ix>")[0..8] / sha256("account:<Name>")[0..8],
 * precomputed. Regenerate if an instruction is renamed.
 */

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
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), holder.toBuffer(), n],
    PROGRAM_ID
  )[0];
}

/* ---------------------------------------------------------------- */
/* encoding                                                          */
/* ---------------------------------------------------------------- */

function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

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
    data: Buffer.concat([
      Buffer.from(IX_BUY_COVER),
      u64(params.nonce),
      borshString(params.flight),
      borshString(params.date),
      u64(BigInt(params.payout)),
    ]),
  });
}

export function fileClaimIx(
  holder: PublicKey,
  policy: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: holder, isSigner: true, isWritable: false },
      { pubkey: policy, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(IX_FILE_CLAIM),
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
  data: Buffer,
  address: PublicKey
): OnChainPolicy | null {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== POLICY_DISCRIMINATOR[i]) return null;
  }
  let o = 8;
  const key = () => {
    const k = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const readU64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const readI64 = () => {
    const v = data.readBigInt64LE(o);
    o += 8;
    return v;
  };
  const readStr = () => {
    const len = data.readUInt32LE(o);
    o += 4;
    const s = data.subarray(o, o + len).toString("utf8");
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
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58FromBytes(POLICY_DISCRIMINATOR) } },
      { memcmp: { offset: 40, bytes: holder.toBase58() } },
    ],
  });
  return accounts
    .map((a) => decodePolicy(Buffer.from(a.account.data), a.pubkey))
    .filter((p): p is OnChainPolicy => p !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** base58 for a short byte array (memcmp filters take base58, not base64). */
function bs58FromBytes(bytes: number[]): string {
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
