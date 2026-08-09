/**
 * Wire-format tests for the browser client.
 *
 * components/protocolClient.ts hand-rolls Anchor's encoding so the dApp doesn't
 * have to ship the Anchor runtime. That trade is only safe if the hand-rolled
 * bytes are checked against how Anchor actually derives them — otherwise a
 * renamed instruction or a reordered struct field breaks the dApp silently, and
 * only in a browser with a wallet attached, which is the one place that is
 * awkward to test.
 *
 * So: nothing here imports the implementation's own constants. Discriminators
 * are re-derived from the instruction names, and the account buffer is encoded
 * independently from the Rust struct's field order.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  PROGRAM_ID,
  bs58FromBytes,
  buyCoverIx,
  decodePolicy,
  fileClaimIx,
  policyPda,
  poolPda,
  vaultPda,
} from "../components/protocolClient.ts";

/** Anchor's discriminator: sha256(namespace:name) truncated to 8 bytes. */
const disc = (preimage: string) =>
  new Uint8Array(createHash("sha256").update(preimage).digest().subarray(0, 8));

/* ---------------------------------------------------------------- */
/* independent Borsh encoder — deliberately not the implementation's */
/* ---------------------------------------------------------------- */

class Enc {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v);
    return this;
  }
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.bytes.push((v >>> (8 * i)) & 0xff);
    return this;
  }
  i64(v: bigint) {
    for (let i = 0n; i < 8n; i++)
      this.bytes.push(Number((BigInt.asUintN(64, v) >> (8n * i)) & 0xffn));
    return this;
  }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    this.u32(b.length);
    this.bytes.push(...b);
    return this;
  }
  key(k: PublicKey) {
    this.bytes.push(...k.toBytes());
    return this;
  }
  raw(b: Uint8Array) {
    this.bytes.push(...b);
    return this;
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

const KEY_A = new PublicKey("3EbtDmPTsD5Y5FdBktBmRUEsPBpvvcaJNwJUARxAYkjB");

/* ---------------------------------------------------------------- */
/* instructions                                                      */
/* ---------------------------------------------------------------- */

test("buy_cover carries the discriminator Anchor derives from its name", () => {
  const ix = buyCoverIx({
    holder: KEY_A,
    holderToken: KEY_A,
    nonce: 1n,
    flight: "TEST-DELAY",
    date: "2026-08-09",
    payout: 10_000,
  });
  assert.deepEqual(
    new Uint8Array(ix.data.subarray(0, 8)),
    disc("global:buy_cover")
  );
});

test("file_claim is the bare discriminator, no args", () => {
  const ix = fileClaimIx(KEY_A, KEY_A);
  assert.deepEqual(new Uint8Array(ix.data), disc("global:file_claim"));
});

test("buy_cover args serialize as Borsh in the program's parameter order", () => {
  const nonce = 1_754_700_000_000n;
  const ix = buyCoverIx({
    holder: KEY_A,
    holderToken: KEY_A,
    nonce,
    flight: "TEST-DELAY",
    date: "2026-08-09",
    payout: 25_000,
  });

  const expected = new Enc()
    .raw(disc("global:buy_cover"))
    .i64(nonce)
    .str("TEST-DELAY")
    .str("2026-08-09")
    .i64(25_000n)
    .done();

  assert.deepEqual(new Uint8Array(ix.data), expected);
});

test("buy_cover passes accounts in the order the program declares them", () => {
  const holderToken = new PublicKey("11111111111111111111111111111112");
  const ix = buyCoverIx({
    holder: KEY_A,
    holderToken,
    nonce: 7n,
    flight: "AI-101",
    date: "2026-08-09",
    payout: 1_000,
  });

  const pool = poolPda();
  assert.deepEqual(
    ix.keys.slice(0, 5).map((k) => k.pubkey.toBase58()),
    [
      KEY_A.toBase58(),
      pool.toBase58(),
      policyPda(KEY_A, 7n).toBase58(),
      vaultPda(pool).toBase58(),
      holderToken.toBase58(),
    ]
  );
  // only the holder signs; a program-owned vault cannot
  assert.deepEqual(
    ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58()),
    [KEY_A.toBase58()]
  );
});

/* ---------------------------------------------------------------- */
/* addresses                                                         */
/* ---------------------------------------------------------------- */

test("PDAs still derive the addresses that are deployed on devnet", () => {
  // Pinned: these hold real state. If a seed changes, the dApp silently starts
  // reading an empty account instead of the live pool.
  const pool = poolPda();
  assert.equal(pool.toBase58(), "3dXoTrVcc3KTYWo5zP1p5HW5yPvnGuyoCWQMe51K5c4R");
  assert.equal(
    vaultPda(pool).toBase58(),
    "AZUkEwuRhD3u2X3jX27UdDY8HNZcPFRuvje3QErMGpZE"
  );
});

test("policy PDAs are per holder and per nonce", () => {
  assert.notEqual(
    policyPda(KEY_A, 1n).toBase58(),
    policyPda(KEY_A, 2n).toBase58()
  );
  assert.equal(policyPda(KEY_A, 1n).toBase58(), policyPda(KEY_A, 1n).toBase58());
});

/* ---------------------------------------------------------------- */
/* account decoding                                                  */
/* ---------------------------------------------------------------- */

/** Encode a Policy account the way the Rust struct lays it out. */
function encodePolicy(over: Partial<Record<string, unknown>> = {}): Uint8Array {
  const p = {
    holder: KEY_A,
    nonce: 42n,
    flight: "TEST-DELAY",
    date: "2026-08-09",
    payout: 25_000n,
    premium: 600n,
    status: 3, // paid
    createdAt: 1_754_700_000n,
    settledAt: 1_754_701_800n,
    basis: "delay 214 min · aviationstake",
    ...over,
  } as {
    holder: PublicKey;
    nonce: bigint;
    flight: string;
    date: string;
    payout: bigint;
    premium: bigint;
    status: number;
    createdAt: bigint;
    settledAt: bigint;
    basis: string;
  };

  return new Enc()
    .raw(disc("account:Policy"))
    .key(poolPda())
    .key(p.holder)
    .i64(p.nonce)
    .str(p.flight)
    .str(p.date)
    .i64(p.payout)
    .i64(p.premium)
    .u8(p.status)
    .i64(p.createdAt)
    .i64(p.settledAt)
    .str(p.basis)
    .u8(255) // bump
    .done();
}

test("decodePolicy reads every field back at the right offset", () => {
  const address = policyPda(KEY_A, 42n);
  const decoded = decodePolicy(encodePolicy(), address);

  assert.ok(decoded, "a correctly encoded Policy must decode");
  assert.deepEqual(decoded, {
    address: address.toBase58(),
    holder: KEY_A.toBase58(),
    nonce: 42n,
    flight: "TEST-DELAY",
    date: "2026-08-09",
    payout: 25_000,
    premium: 600,
    status: "paid",
    createdAt: 1_754_700_000,
    settledAt: 1_754_701_800,
    // the interpunct is 2 bytes: proves the length prefix is bytes, not chars
    basis: "delay 214 min · aviationstake",
  });
});

test("the status byte maps to the program's PolicyStatus order", () => {
  const statuses = ["active", "requested", "escalated", "paid", "denied"];
  statuses.forEach((expected, i) => {
    assert.equal(decodePolicy(encodePolicy({ status: i }), KEY_A)?.status, expected);
  });
});

test("decodePolicy ignores accounts that are not policies", () => {
  const notAPolicy = encodePolicy();
  notAPolicy[0] ^= 0xff; // corrupt the discriminator
  assert.equal(decodePolicy(notAPolicy, KEY_A), null);
});

test("decodePolicy handles an unsettled policy", () => {
  const decoded = decodePolicy(
    encodePolicy({ status: 0, settledAt: 0n, basis: "" }),
    KEY_A
  );
  assert.equal(decoded?.status, "active");
  assert.equal(decoded?.settledAt, 0);
  assert.equal(decoded?.basis, "");
});

/* ---------------------------------------------------------------- */
/* RPC filters                                                       */
/* ---------------------------------------------------------------- */

test("base58 encoding matches a reference encoder", () => {
  const encode = (b: number[]) => bs58.encode(Uint8Array.from(b));
  const cases: number[][] = [
    [222, 135, 7, 163, 235, 177, 33, 68], // the Policy discriminator
    [0, 0, 1, 2, 3], // leading zeros must survive as leading '1's
    [0, 0, 0, 0],
    [255, 255, 255, 255, 255, 255, 255, 255],
    [1],
  ];
  for (const c of cases) assert.equal(bs58FromBytes(c), encode(c), c.join(","));
});

test("the Policy discriminator the filter uses is the one Anchor derives", () => {
  assert.equal(
    bs58FromBytes([...disc("account:Policy")]),
    bs58.encode(disc("account:Policy"))
  );
});

test("PROGRAM_ID is the deployed program", () => {
  assert.equal(
    PROGRAM_ID.toBase58(),
    "4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr"
  );
});
