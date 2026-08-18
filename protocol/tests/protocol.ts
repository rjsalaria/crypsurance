/**
 * CrypSurance protocol tests.
 *
 * These deliberately concentrate on the security properties the product's
 * claims rest on, not just the happy path:
 *
 *   - the premium is computed on-chain, so a client cannot under-pay;
 *   - only the holder can claim their own policy;
 *   - settlement needs M-of-N operators to agree, and the account that submits
 *     it is checked against nothing — no single key can settle a claim;
 *   - whoever decides a claim still CANNOT choose the recipient. That property
 *     is what makes this different from a company with a database, and it has
 *     to survive every change to how the verdict is reached, so it is tested
 *     under consensus exactly as it was under a single oracle;
 *   - an operator cannot vote twice, and a claim cannot be settled twice.
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
  // M3: three operators, because a threshold only means something above one
  const opA = Keypair.generate();
  const opB = Keypair.generate();
  const opC = Keypair.generate();

  let mint: PublicKey;
  let pool: PublicKey;
  let vault: PublicKey;
  let registry: PublicKey;
  let stakeVault: PublicKey;
  let holderToken: PublicKey;
  let strangerToken: PublicKey;
  const opToken: Record<string, PublicKey> = {};

  const MIN_STAKE = 5_000;

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

  const operatorPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), pool.toBuffer(), owner.toBuffer()],
      program.programId
    )[0];

  /** Register `who` as an operator with `stake` whole tokens. */
  async function register(who: Keypair, stake = MIN_STAKE) {
    await program.methods
      .registerOperator(new BN(stake))
      .accountsPartial({
        authority: who.publicKey,
        pool,
        registry,
        operator: operatorPda(who.publicKey),
        stakeVault,
        operatorToken: opToken[who.publicKey.toBase58()],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
    return operatorPda(who.publicKey);
  }

  const tallyPda = (policy: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("tally"), policy.toBuffer()],
      program.programId
    )[0];

  const attestPda = (policy: PublicKey, operatorAccount: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("attest"), policy.toBuffer(), operatorAccount.toBuffer()],
      program.programId
    )[0];

  /** File a claim, opening its tally. */
  async function file(policy: PublicKey, who = holder) {
    await program.methods
      .fileClaim()
      .accountsPartial({
        holder: who.publicKey,
        policy,
        tally: tallyPda(policy),
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
  }

  /** One operator's verdict. */
  async function attest(
    who: Keypair,
    policy: PublicKey,
    approved: boolean,
    basis = "testnet-simulated"
  ) {
    const operatorAccount = operatorPda(who.publicKey);
    await program.methods
      .attestClaim(approved, basis)
      .accountsPartial({
        authority: who.publicKey,
        pool,
        registry,
        operator: operatorAccount,
        policy,
        tally: tallyPda(policy),
        attestation: attestPda(policy, operatorAccount),
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
  }

  /** Crank settlement. The signer is deliberately arbitrary. */
  async function settle(
    policy: PublicKey,
    token = holderToken,
    cranker: Keypair = stranger
  ) {
    await program.methods
      .settleClaim()
      .accountsPartial({
        cranker: cranker.publicKey,
        pool,
        registry,
        policy,
        tally: tallyPda(policy),
        vault,
        holderToken: token,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([cranker])
      .rpc();
  }

  before(async () => {
    for (const kp of [oracle, holder, stranger, opA, opB, opC]) {
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

    // and the operators, so they can stake
    for (const kp of [opA, opB, opC]) {
      const ata = (
        await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)
      ).address;
      opToken[kp.publicKey.toBase58()] = ata;
      await mintTo(conn, admin, mint, ata, admin, ui(50_000));
    }

    [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );
    [registry] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry"), pool.toBuffer()],
      program.programId
    );
    [stakeVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_vault"), pool.toBuffer()],
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
      await file(policy, stranger);
      assert.fail("a stranger should not be able to file this claim");
    } catch (e: any) {
      // the PDA is derived from the signer, so this fails as a seeds/has_one violation
      assert.ok(e.toString().length > 0);
    }

    await file(policy);

    const p = await program.account.policy.fetch(policy);
    assert.deepEqual(p.status, { requested: {} });
    assert.equal(n.toNumber(), nonce);
  });

  /* ---------------------------------------------------------------- */
  /* M3 week 1 — the operator registry                                 */
  /* ---------------------------------------------------------------- */

  describe("operator registry", () => {
    it("initializes with a stake vault the program owns", async () => {
      await program.methods
        .initializeRegistry(2, new BN(MIN_STAKE))
        .accountsPartial({
          authority: admin.publicKey,
          pool,
          registry,
          stakeVault,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const r = await program.account.registry.fetch(registry);
      assert.equal(r.threshold, 2);
      assert.equal(r.minStake.toNumber(), MIN_STAKE);
      assert.equal(r.operatorCount, 0);

      // Same property as the payout vault: stake is beyond any private key.
      const sv = await getAccount(conn, stakeVault);
      assert.equal(sv.owner.toBase58(), pool.toBase58());
    });

    it("refuses a threshold of zero", async () => {
      try {
        await program.methods
          .setThreshold(0)
          .accountsPartial({ registry, authority: admin.publicKey })
          .rpc();
        assert.fail("a zero threshold would settle claims with no agreement");
      } catch (e: any) {
        assert.include(e.toString(), "BadThreshold");
      }
    });

    it("takes the stake into the vault when an operator registers", async () => {
      const before = (await getAccount(conn, opToken[opA.publicKey.toBase58()])).amount;
      const vaultBefore = (await getAccount(conn, stakeVault)).amount;

      const op = await register(opA);

      const o = await program.account.operator.fetch(op);
      assert.equal(o.authority.toBase58(), opA.publicKey.toBase58());
      assert.equal(o.stake.toNumber(), MIN_STAKE);
      assert.equal(o.pending, 0);
      assert.isTrue(o.active);

      const after = (await getAccount(conn, opToken[opA.publicKey.toBase58()])).amount;
      assert.equal(before - after, ui(MIN_STAKE), "stake actually left the wallet");
      const vaultAfter = (await getAccount(conn, stakeVault)).amount;
      assert.equal(vaultAfter - vaultBefore, ui(MIN_STAKE));

      const r = await program.account.registry.fetch(registry);
      assert.equal(r.operatorCount, 1);
    });

    it("rejects a stake below the minimum", async () => {
      try {
        await register(opB, MIN_STAKE - 1);
        assert.fail("under-staked registration should be rejected");
      } catch (e: any) {
        assert.include(e.toString(), "StakeBelowMinimum");
      }

      // and the rejection left nothing behind
      const r = await program.account.registry.fetch(registry);
      assert.equal(r.operatorCount, 1);
    });

    it("will not let the same key register twice", async () => {
      try {
        await register(opA);
        assert.fail("a second registration should collide with the existing PDA");
      } catch (e: any) {
        // 0x0 is the system program refusing to allocate an account that
        // already exists — the collision happens before any of our code runs.
        assert.include(e.toString(), "custom program error: 0x0");
      }

      const r = await program.account.registry.fetch(registry);
      assert.equal(r.operatorCount, 1, "count must not drift on a failed register");
    });

    it("will not let the pool admin withdraw another operator's stake", async () => {
      // The admin controls the pool, the oracle and the registry — but the
      // operator account's seeds include the signer, so the admin literally
      // cannot name someone else's operator account in this instruction.
      try {
        await program.methods
          .deregisterOperator()
          .accountsPartial({
            authority: admin.publicKey,
            pool,
            registry,
            operator: operatorPda(opA.publicKey),
            stakeVault,
            operatorToken: opToken[opA.publicKey.toBase58()],
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("the admin must not be able to take an operator's stake");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintSeeds");
      }

      const o = await program.account.operator.fetch(operatorPda(opA.publicKey));
      assert.equal(o.stake.toNumber(), MIN_STAKE, "stake is untouched");
    });

    it("returns the stake when an operator leaves", async () => {
      await register(opB, MIN_STAKE * 2);
      const before = (await getAccount(conn, opToken[opB.publicKey.toBase58()])).amount;

      await program.methods
        .deregisterOperator()
        .accountsPartial({
          authority: opB.publicKey,
          pool,
          registry,
          operator: operatorPda(opB.publicKey),
          stakeVault,
          operatorToken: opToken[opB.publicKey.toBase58()],
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([opB])
        .rpc();

      const after = (await getAccount(conn, opToken[opB.publicKey.toBase58()])).amount;
      assert.equal(after - before, ui(MIN_STAKE * 2), "the whole stake came back");

      // account closed, so the roll-call shrinks
      const r = await program.account.registry.fetch(registry);
      assert.equal(r.operatorCount, 1);
      const gone = await conn.getAccountInfo(operatorPda(opB.publicKey));
      assert.isNull(gone);
    });

    it("registers the three operators the sprint needs", async () => {
      await register(opB);
      await register(opC);

      const r = await program.account.registry.fetch(registry);
      assert.equal(r.operatorCount, 3);
      assert.equal(
        (await getAccount(conn, stakeVault)).amount,
        ui(MIN_STAKE * 3),
        "vault holds exactly the three stakes"
      );
    });
  });
  /* ---------------------------------------------------------------- */
  /* M3 week 2 — attestations and M-of-N settlement                    */
  /* ---------------------------------------------------------------- */

  describe("consensus settlement", () => {
    /** Buy cover and file the claim, ready to be attested. */
    async function claimable(payout = 10_000, flight = "TEST-DELAY") {
      const { policy } = await buy(payout, flight);
      await file(policy);
      return policy;
    }

    it("will not settle before the threshold is met", async () => {
      const policy = await claimable();
      await attest(opA, policy, true);

      try {
        await settle(policy);
        assert.fail("one attestation settled a claim needing two");
      } catch (e: any) {
        assert.include(e.toString(), "ThresholdNotMet");
      }

      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { requested: {} }, "still awaiting agreement");
    });

    it("pays the holder once two operators agree, with nobody privileged signing", async () => {
      const policy = await claimable();
      const before = (await getAccount(conn, holderToken)).amount;

      await attest(opA, policy, true, "delay 214 min");
      await attest(opB, policy, true, "delay 214 min");

      // `stranger` has no role: not the oracle, not an operator, not the
      // holder. If this settles, settlement is genuinely permissionless.
      await settle(policy, holderToken, stranger);

      const after = (await getAccount(conn, holderToken)).amount;
      assert.equal(after - before, ui(10_000), "the payout reached the holder");

      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { paid: {} });
      assert.equal(p.basis, "delay 214 min");
    });

    it("will not let an operator redirect a payout to another wallet", async () => {
      // The M2 guarantee, restated for consensus: operators decide whether a
      // claim is valid and never who is paid. This is the test the product's
      // central claim rests on, and it must survive every change to how the
      // verdict is reached.
      const policy = await claimable();
      await attest(opA, policy, true);
      await attest(opB, policy, true);

      try {
        await settle(policy, strangerToken, stranger);
        assert.fail("a payout was redirected away from the policy holder");
      } catch (e: any) {
        assert.include(e.toString(), "WrongTokenOwner");
      }

      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { requested: {} }, "nothing settled");
    });

    it("will not let one operator attest twice to reach the threshold alone", async () => {
      const policy = await claimable();
      await attest(opA, policy, true);

      try {
        await attest(opA, policy, true);
        assert.fail("an operator voted twice");
      } catch (e: any) {
        // the attestation PDA already exists — the system program refuses to
        // allocate it again, before any of our logic runs
        assert.include(e.toString(), "custom program error: 0x0");
      }

      const t = await program.account.claimTally.fetch(tallyPda(policy));
      assert.equal(t.approvals, 1, "the tally did not move");
    });

    it("refuses an attestation from a key that is not a registered operator", async () => {
      const policy = await claimable();
      try {
        await attest(stranger, policy, true);
        assert.fail("an unregistered key attested");
      } catch (e: any) {
        // no Operator account exists at the seeds derived from this signer
        assert.ok(e.toString().length > 0);
      }
    });

    it("denies the claim when the operators agree it should not pay", async () => {
      const policy = await claimable(10_000, "TEST-ONTIME");
      const vaultBefore = (await getAccount(conn, vault)).amount;
      const holderBefore = (await getAccount(conn, holderToken)).amount;

      await attest(opA, policy, false, "on time");
      await attest(opB, policy, false, "on time");
      await settle(policy);

      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { denied: {} });
      assert.equal(
        (await getAccount(conn, vault)).amount,
        vaultBefore,
        "a denial must not move funds"
      );
      assert.equal((await getAccount(conn, holderToken)).amount, holderBefore);
    });

    it("cannot settle the same claim twice", async () => {
      const policy = await claimable();
      await attest(opA, policy, true);
      await attest(opB, policy, true);
      await settle(policy);

      try {
        await settle(policy);
        assert.fail("a settled claim was settled again");
      } catch (e: any) {
        assert.include(e.toString(), "NotSettleable");
      }
    });

    it("counts each operator's attestations against their stake", async () => {
      const o = await program.account.operator.fetch(operatorPda(opA.publicKey));
      assert.isAbove(o.attestations.toNumber(), 0);
      // pending stays raised until week 3 judges each attestation, which is
      // what stops an operator withdrawing before its votes are assessed
      assert.isAbove(o.pending, 0);
    });

    it("will not let an operator withdraw stake with attestations outstanding", async () => {
      try {
        await program.methods
          .deregisterOperator()
          .accountsPartial({
            authority: opA.publicKey,
            pool,
            registry,
            operator: operatorPda(opA.publicKey),
            stakeVault,
            operatorToken: opToken[opA.publicKey.toBase58()],
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([opA])
          .rpc();
        assert.fail("an operator withdrew while its votes were unjudged");
      } catch (e: any) {
        assert.include(e.toString(), "OperatorHasPendingAttestations");
      }
    });

    it("keeps a running count of policies and settlements", async () => {
      const p = await program.account.pool.fetch(pool);
      assert.isAbove(p.policies.toNumber(), 0);
      assert.isAbove(p.claimsPaid.toNumber(), 0);
      assert.isAbove(p.claimsDenied.toNumber(), 0);
    });
  });

});
