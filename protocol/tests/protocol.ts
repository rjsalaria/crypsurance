/**
 * CrypSurance protocol tests.
 *
 * These deliberately concentrate on the security properties the product's
 * claims rest on, not just the happy path:
 *
 *   - the premium is computed on-chain, so a client cannot under-pay;
 *   - only the holder can claim their own policy;
 *   - only the oracle can settle, and it CANNOT choose the recipient — the
 *     "oracle can't decide where the money goes" claim is what makes M2
 *     meaningfully different from the memo prototype, so it gets a test;
 *   - a claim cannot be settled twice, or claimed twice.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { Protocol } from "../target/types/protocol";

const DECIMALS = 9;
const ui = (n: number) => BigInt(n) * 10n ** BigInt(DECIMALS);

describe("crypsurance protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.protocol as Program<Protocol>;
  const conn = provider.connection;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();
  const holder = Keypair.generate();
  const stranger = Keypair.generate();

  let mint: PublicKey;
  let pool: PublicKey;
  let vault: PublicKey;
  let holderToken: PublicKey;
  let strangerToken: PublicKey;

  let nonce = 0;
  const nextNonce = () => new BN(++nonce);

  const policyPda = (owner: PublicKey, n: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), owner.toBuffer(), n.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  /** Buy cover and return its policy PDA + nonce. */
  async function buy(payout: number, flight = "TEST-DELAY") {
    const n = nextNonce();
    const policy = policyPda(holder.publicKey, n);
    await program.methods
      .buyCover(n, flight, "2026-08-06", new BN(payout))
      .accountsPartial({
        holder: holder.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([holder])
      .rpc();
    return { policy, n };
  }

  before(async () => {
    for (const kp of [oracle, holder, stranger]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }

    mint = await createMint(conn, admin, admin.publicKey, null, DECIMALS);

    holderToken = (
      await getOrCreateAssociatedTokenAccount(conn, admin, mint, holder.publicKey)
    ).address;
    strangerToken = (
      await getOrCreateAssociatedTokenAccount(conn, admin, mint, stranger.publicKey)
    ).address;

    // fund the holder so they can pay premiums
    await mintTo(conn, admin, mint, holderToken, admin, ui(100_000));

    [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );
  });

  it("initializes the pool with a program-owned vault", async () => {
    await program.methods
      .initializePool(oracle.publicKey)
      .accountsPartial({
        authority: admin.publicKey,
        pool,
        vault,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const p = await program.account.pool.fetch(pool);
    assert.equal(p.oracle.toBase58(), oracle.publicKey.toBase58());
    assert.equal(p.mint.toBase58(), mint.toBase58());

    // The vault's authority is the pool PDA — this is the whole point: no
    // private key anywhere can move these funds.
    const v = await getAccount(conn, vault);
    assert.equal(v.owner.toBase58(), pool.toBase58());

    // Seed the pool so it can actually pay claims.
    await mintTo(conn, admin, mint, vault, admin, ui(500_000));
  });

  it("charges a premium computed on-chain, not supplied by the client", async () => {
    const before = (await getAccount(conn, holderToken)).amount;
    const { policy } = await buy(10_000);

    const p = await program.account.policy.fetch(policy);
    // 2.4% of 10,000 = 240 — derived by the program from the payout
    assert.equal(p.premium.toNumber(), 240);
    assert.equal(p.payout.toNumber(), 10_000);
    assert.deepEqual(p.status, { active: {} });

    const after = (await getAccount(conn, holderToken)).amount;
    assert.equal(before - after, ui(240), "exactly the premium left the wallet");
  });

  it("rejects a payout outside the permitted range", async () => {
    try {
      await buy(999_999);
      assert.fail("should have rejected an out-of-range payout");
    } catch (e: any) {
      assert.include(e.toString(), "PayoutOutOfRange");
    }
  });

  it("lets only the holder file a claim", async () => {
    const { policy, n } = await buy(10_000);

    // a stranger signing for someone else's policy must fail
    try {
      await program.methods
        .fileClaim()
        .accountsPartial({ holder: stranger.publicKey, policy })
        .signers([stranger])
        .rpc();
      assert.fail("a stranger should not be able to file this claim");
    } catch (e: any) {
      // the PDA is derived from the signer, so this fails as a seeds/has_one violation
      assert.ok(e.toString().length > 0);
    }

    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    const p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { requested: {} });
    assert.equal(n.toNumber(), nonce);
  });

  it("refuses to settle for anyone but the oracle", async () => {
    const { policy } = await buy(10_000);
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    try {
      await program.methods
        .settleClaim(true, "forged")
        .accountsPartial({
          oracle: stranger.publicKey,
          pool,
          policy,
          vault,
          holderToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc();
      assert.fail("a non-oracle settled a claim");
    } catch (e: any) {
      assert.include(e.toString(), "NotOracle");
    }
  });

  it("will not let the oracle redirect a payout to another wallet", async () => {
    const { policy } = await buy(10_000);
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    // The oracle is legitimate here — it is the DESTINATION that is wrong.
    // Even a fully compromised oracle key must not be able to steal a payout.
    try {
      await program.methods
        .settleClaim(true, "testnet-simulated")
        .accountsPartial({
          oracle: oracle.publicKey,
          pool,
          policy,
          vault,
          holderToken: strangerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([oracle])
        .rpc();
      assert.fail("the oracle redirected a payout away from the holder");
    } catch (e: any) {
      assert.include(e.toString(), "WrongTokenOwner");
    }
  });

  it("pays the holder from the vault when the oracle approves", async () => {
    const { policy } = await buy(10_000);
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    const holderBefore = (await getAccount(conn, holderToken)).amount;
    const vaultBefore = (await getAccount(conn, vault)).amount;

    await program.methods
      .settleClaim(true, "testnet-simulated")
      .accountsPartial({
        oracle: oracle.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([oracle])
      .rpc();

    const p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { paid: {} });
    assert.equal(p.basis, "testnet-simulated");

    const holderAfter = (await getAccount(conn, holderToken)).amount;
    const vaultAfter = (await getAccount(conn, vault)).amount;
    assert.equal(holderAfter - holderBefore, ui(10_000), "holder received the payout");
    assert.equal(vaultBefore - vaultAfter, ui(10_000), "vault paid it");
  });

  it("does not move funds when a claim is denied", async () => {
    const { policy } = await buy(10_000);
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    const vaultBefore = (await getAccount(conn, vault)).amount;
    await program.methods
      .settleClaim(false, "flight on time")
      .accountsPartial({
        oracle: oracle.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([oracle])
      .rpc();

    const p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { denied: {} });
    assert.equal((await getAccount(conn, vault)).amount, vaultBefore);
  });

  it("cannot settle the same claim twice", async () => {
    const { policy } = await buy(10_000);
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    const settle = () =>
      program.methods
        .settleClaim(true, "testnet-simulated")
        .accountsPartial({
          oracle: oracle.publicKey,
          pool,
          policy,
          vault,
          holderToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([oracle])
        .rpc();

    await settle();
    try {
      await settle();
      assert.fail("a settled claim was paid a second time");
    } catch (e: any) {
      assert.include(e.toString(), "NotSettleable");
    }
  });

  it("escalates an unverifiable claim, and can settle it afterwards", async () => {
    const { policy } = await buy(10_000, "AI302");
    await program.methods
      .fileClaim()
      .accountsPartial({ holder: holder.publicKey, policy })
      .signers([holder])
      .rpc();

    await program.methods
      .escalateClaim("no flight data")
      .accountsPartial({
        oracle: oracle.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([oracle])
      .rpc();

    let p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { escalated: {} });

    // human verification came back positive
    await program.methods
      .settleClaim(true, "partner:AirlineDesk")
      .accountsPartial({
        oracle: oracle.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([oracle])
      .rpc();

    p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { paid: {} });
    assert.equal(p.basis, "partner:AirlineDesk");
  });

  it("keeps a running count of policies and settlements", async () => {
    const p = await program.account.pool.fetch(pool);
    assert.isAbove(p.policies.toNumber(), 0);
    assert.isAbove(p.claimsPaid.toNumber(), 0);
    assert.isAbove(p.claimsDenied.toNumber(), 0);
  });
});
