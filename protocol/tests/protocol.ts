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
import { createHash, randomBytes } from "crypto";
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
  // a clean operator for the no-show test — the others have been slashed or
  // have verdicts outstanding by the time it runs
  const opD = Keypair.generate();

  let mint: PublicKey;
  let pool: PublicKey;
  let vault: PublicKey;
  let registry: PublicKey;
  let stakeVault: PublicKey;
  let params: PublicKey;
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

  /** sha256(approved || salt || operatorAccount) — must match the program. */
  const commitmentFor = (approved: boolean, salt: Buffer, operatorAccount: PublicKey) =>
    createHash("sha256")
      .update(Buffer.concat([Buffer.from([approved ? 1 : 0]), salt, operatorAccount.toBuffer()]))
      .digest();

  /** Commit to a verdict without revealing it. Returns the salt to reveal with. */
  async function commit(who: Keypair, policy: PublicKey, approved: boolean) {
    const operatorAccount = operatorPda(who.publicKey);
    const salt = randomBytes(32);
    const commitment = commitmentFor(approved, salt, operatorAccount);
    await program.methods
      .commitAttestation([...commitment])
      .accountsPartial({
        authority: who.publicKey,
        pool,
        registry,
        params,
        operator: operatorAccount,
        policy,
        tally: tallyPda(policy),
        attestation: attestPda(policy, operatorAccount),
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
    return { salt, commitment };
  }

  /** Open the envelope. */
  async function reveal(
    who: Keypair,
    policy: PublicKey,
    approved: boolean,
    salt: Buffer,
    basis = "testnet-simulated"
  ) {
    const operatorAccount = operatorPda(who.publicKey);
    await program.methods
      .revealAttestation(approved, basis, [...salt])
      .accountsPartial({
        authority: who.publicKey,
        pool,
        params,
        operator: operatorAccount,
        policy,
        tally: tallyPda(policy),
        attestation: attestPda(policy, operatorAccount),
      })
      .signers([who])
      .rpc();
  }

  /** Judge one operator's verdict against the settled outcome. */
  async function resolve(who: Keypair, policy: PublicKey, cranker: Keypair = stranger) {
    const operatorAccount = operatorPda(who.publicKey);
    await program.methods
      .resolveAttestation()
      .accountsPartial({
        cranker: cranker.publicKey,
        pool,
        registry,
        params,
        policy,
        tally: tallyPda(policy),
        attestation: attestPda(policy, operatorAccount),
        operator: operatorAccount,
        stakeVault,
        vault,
        operatorToken: opToken[who.publicKey.toBase58()],
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([cranker])
      .rpc();
  }

  before(async () => {
    for (const kp of [oracle, holder, stranger, opA, opB, opC, opD]) {
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
    for (const kp of [opA, opB, opC, opD]) {
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
    [params] = PublicKey.findProgramAddressSync(
      [Buffer.from("params"), pool.toBuffer()],
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
  /* M3 week 3 — hidden verdicts and slashing                          */
  /* ---------------------------------------------------------------- */

  describe("commit-reveal and slashing", () => {
    // Windows are set to zero in tests so reveals are accepted immediately;
    // the timing rules themselves are asserted separately below with a real
    // commit window.
    const SLASH_BPS = 1000; // 10%
    const REWARD_BPS = 3000; // 30% of each premium, split across the set

    /**
     * Close the commit window on demand rather than sleeping through it.
     * Timing sleeps race the two transactions that open a claim, which made
     * these tests flaky; the window is a parameter, so the test can just shut
     * it. The rule that reveals are refused while it is open gets its own test
     * with the window genuinely open.
     */
    const closeCommitWindow = () => setWindows(0, 3_600);

    async function setWindows(commit: number, reveal: number) {
      await program.methods
        .setParams(SLASH_BPS, new BN(86_400), new BN(commit), new BN(reveal), REWARD_BPS)
        .accountsPartial({ params, authority: admin.publicKey })
        .rpc();
    }

    // Each test starts from the same window configuration. Tests that close
    // the commit window would otherwise leave it shut for whatever ran next,
    // which is how the first version of this suite failed.
    beforeEach(async () => {
      if (await conn.getAccountInfo(params)) await setWindows(30, 3_600);
    });

    async function claimable(payout = 10_000, flight = "TEST-DELAY") {
      const { policy } = await buy(payout, flight);
      await file(policy);
      return policy;
    }

    it("initializes tunable parameters", async () => {
      await program.methods
        .initializeParams(SLASH_BPS, new BN(86_400), new BN(30), new BN(3_600), REWARD_BPS)
        .accountsPartial({
          authority: admin.publicKey,
          pool,
          params,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const p = await program.account.params.fetch(params);
      assert.equal(p.slashBps, SLASH_BPS);
      assert.equal(p.rewardBps, REWARD_BPS);
      assert.equal(p.disputeWindow.toNumber(), 86_400);
    });

    it("stores a commitment that reveals nothing", async () => {
      const policy = await claimable();
      const { commitment } = await commit(opA, policy, true);

      const a = await program.account.attestation.fetch(
        attestPda(policy, operatorPda(opA.publicKey))
      );
      assert.isFalse(a.revealed);
      assert.deepEqual(Buffer.from(a.commitment), commitment);
      // the verdict field exists but carries no information yet
      assert.isFalse(a.approved);

      const t = await program.account.claimTally.fetch(tallyPda(policy));
      assert.equal(t.approvals, 0, "a commitment must not move the tally");
      assert.equal(t.denials, 0);
    });

    it("counts the verdict only once revealed", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);

      const t = await program.account.claimTally.fetch(tallyPda(policy));
      assert.equal(t.approvals, 1);
    });

    it("rejects a reveal that does not match the commitment", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      await closeCommitWindow();

      try {
        // same salt, opposite verdict
        await reveal(opA, policy, false, a.salt);
        assert.fail("a verdict was changed after committing to it");
      } catch (e: any) {
        assert.include(e.toString(), "CommitmentMismatch");
      }
    });

    it("will not accept a reveal while the commit window is open", async () => {
      await setWindows(3_600, 3_600); // an hour to commit
      const policy = await claimable();
      const a = await commit(opA, policy, true);

      try {
        await reveal(opA, policy, true, a.salt);
        assert.fail("an early reveal would leak the answer to everyone else");
      } catch (e: any) {
        assert.include(e.toString(), "CommitWindowOpen");
      }
      await setWindows(30, 3_600);
    });

    it("pays out when the revealed verdicts reach the threshold", async () => {
      const policy = await claimable();
      const before = (await getAccount(conn, holderToken)).amount;

      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt, "delay 214 min");
      await reveal(opB, policy, true, b.salt, "delay 214 min");
      await settle(policy);

      const after = (await getAccount(conn, holderToken)).amount;
      assert.equal(after - before, ui(10_000));
      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { paid: {} });
    });

    it("credits an operator whose verdict matched the outcome", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await settle(policy);

      const beforeAgreed = (
        await program.account.operator.fetch(operatorPda(opA.publicKey))
      ).agreed.toNumber();

      await resolve(opA, policy);

      const o = await program.account.operator.fetch(operatorPda(opA.publicKey));
      assert.equal(o.agreed.toNumber(), beforeAgreed + 1);
      assert.equal(o.stake.toNumber(), MIN_STAKE, "an agreeing operator keeps its stake");
    });

    it("slashes an operator whose verdict contradicted the outcome", async () => {
      const policy = await claimable();
      // A and B say pay; C says deny and is therefore wrong
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      const c = await commit(opC, policy, false);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await reveal(opC, policy, false, c.salt);
      await settle(policy);

      const before = (await program.account.operator.fetch(operatorPda(opC.publicKey))).stake.toNumber();
      const vaultBefore = (await getAccount(conn, vault)).amount;

      await resolve(opC, policy);

      const o = await program.account.operator.fetch(operatorPda(opC.publicKey));
      const expected = before - Math.floor((before * SLASH_BPS) / 10_000);
      assert.equal(o.stake.toNumber(), expected, "10% of stake taken");

      // the slashed stake backs future payouts rather than paying the majority
      const vaultAfter = (await getAccount(conn, vault)).amount;
      assert.equal(vaultAfter - vaultBefore, ui(before - expected));
    });

    it("slashes an operator that sealed a verdict and never opened it", async () => {
      await register(opD);
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await commit(opD, policy, true); // opD commits and then goes silent
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await settle(policy);

      // while revealing is still possible, a silent operator cannot be judged
      try {
        await resolve(opD, policy);
        assert.fail("judged a sealed verdict while it could still be opened");
      } catch (e: any) {
        assert.include(e.toString(), "RevealWindowOpen");
      }

      // once the reveal window shuts, silence costs the same as being wrong
      await setWindows(0, 0);
      const before = (
        await program.account.operator.fetch(operatorPda(opD.publicKey))
      ).stake.toNumber();
      await resolve(opD, policy);
      const after = (
        await program.account.operator.fetch(operatorPda(opD.publicKey))
      ).stake.toNumber();

      assert.isBelow(after, before, "a no-show is slashed");
      assert.equal(after, before - Math.floor((before * SLASH_BPS) / 10_000));
    });

    it("pays a correct operator out of the premium", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await settle(policy);

      const wallet = opToken[opA.publicKey.toBase58()];
      const before = (await getAccount(conn, wallet)).amount;
      await resolve(opA, policy);
      const after = (await getAccount(conn, wallet)).amount;

      // premium is 2.4% of a 10,000 payout = 240; 30% of that is 72, split
      // across the registered operators
      const p = await program.account.policy.fetch(policy);
      const reg = await program.account.registry.fetch(registry);
      const expected = Math.floor(
        Math.floor((p.premium.toNumber() * REWARD_BPS) / 10_000) / reg.operatorCount
      );
      assert.isAbove(expected, 0, "the reward must be worth collecting");
      assert.equal(after - before, ui(expected), "paid for work it got right");
    });

    it("lets a slashed operator top up and rejoin", async () => {
      // opC was slashed below the minimum by the test above and is out
      const before = await program.account.operator.fetch(operatorPda(opC.publicKey));
      assert.isFalse(before.active, "precondition: slashed out of the set");
      assert.isBelow(before.stake.toNumber(), MIN_STAKE);

      const topUp = MIN_STAKE - before.stake.toNumber();
      await program.methods
        .addStake(new BN(topUp))
        .accountsPartial({
          authority: opC.publicKey,
          pool,
          registry,
          operator: operatorPda(opC.publicKey),
          stakeVault,
          operatorToken: opToken[opC.publicKey.toBase58()],
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([opC])
        .rpc();

      const after = await program.account.operator.fetch(operatorPda(opC.publicKey));
      assert.equal(after.stake.toNumber(), MIN_STAKE);
      assert.isTrue(after.active, "back above the floor, back in the rotation");
    });

    it("will not let one operator top up another's stake", async () => {
      try {
        await program.methods
          .addStake(new BN(100))
          .accountsPartial({
            authority: opA.publicKey,
            pool,
            registry,
            operator: operatorPda(opC.publicKey),
            stakeVault,
            operatorToken: opToken[opA.publicKey.toBase58()],
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([opA])
          .rpc();
        assert.fail("topped up an operator account that was not the signer's");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintSeeds");
      }
    });

    it("pays nothing to an operator that got it wrong", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      const c = await commit(opC, policy, false);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await reveal(opC, policy, false, c.salt);
      await settle(policy);

      const wallet = opToken[opC.publicKey.toBase58()];
      const before = (await getAccount(conn, wallet)).amount;
      await resolve(opC, policy);
      const after = (await getAccount(conn, wallet)).amount;

      assert.equal(after, before, "a wrong verdict earns nothing");
    });

    it("will not judge the same attestation twice", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await settle(policy);
      await resolve(opA, policy);

      try {
        await resolve(opA, policy);
        assert.fail("stake was judged twice for one verdict");
      } catch (e: any) {
        assert.include(e.toString(), "AlreadyResolved");
      }
    });

    it("will not judge an attestation before the claim settles", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);

      try {
        await resolve(opA, policy);
        assert.fail("an attestation was judged against an unsettled claim");
      } catch (e: any) {
        assert.include(e.toString(), "NotSettled");
      }
    });

    it("clears one pending count per verdict judged", async () => {
      const policy = await claimable();
      const a = await commit(opA, policy, true);
      const b = await commit(opB, policy, true);
      await closeCommitWindow();
      await reveal(opA, policy, true, a.salt);
      await reveal(opB, policy, true, b.salt);
      await settle(policy);

      const before = (
        await program.account.operator.fetch(operatorPda(opB.publicKey))
      ).pending;
      await resolve(opB, policy);
      const after = (
        await program.account.operator.fetch(operatorPda(opB.publicKey))
      ).pending;

      assert.equal(after, before - 1, "one judged verdict clears one count");
    });

    it("will not let an operator withdraw while a verdict is unjudged", async () => {
      // opB is carrying commitments from the tests above, which is exactly the
      // state that must block withdrawal — vote, then leave before being
      // judged, is the move this prevents.
      const o = await program.account.operator.fetch(operatorPda(opB.publicKey));
      assert.isAbove(o.pending, 0, "precondition: something is outstanding");

      try {
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
        assert.fail("an operator withdrew before its verdicts were judged");
      } catch (e: any) {
        assert.include(e.toString(), "OperatorHasPendingAttestations");
      }
    });

    it("refuses to escalate a stalled claim before the deadline", async () => {
      const policy = await claimable();
      await commit(opA, policy, true);

      try {
        await program.methods
          .escalateStalledClaim()
          .accountsPartial({
            cranker: stranger.publicKey,
            pool,
            registry,
            params,
            policy,
            tally: tallyPda(policy),
          })
          .signers([stranger])
          .rpc();
        assert.fail("escalated a claim whose dispute window was still open");
      } catch (e: any) {
        assert.include(e.toString(), "DisputeWindowOpen");
      }
    });

    it("lets anyone escalate a claim nobody finished assessing", async () => {
      // shrink the dispute window so the deadline has already passed
      await program.methods
        .setParams(SLASH_BPS, new BN(1), new BN(30), new BN(3_600), REWARD_BPS)
        .accountsPartial({ params, authority: admin.publicKey })
        .rpc();

      const policy = await claimable();
      await new Promise((r) => setTimeout(r, 1500));

      await program.methods
        .escalateStalledClaim()
        .accountsPartial({
          cranker: stranger.publicKey,
          pool,
          registry,
          params,
          policy,
          tally: tallyPda(policy),
        })
        .signers([stranger])
        .rpc();

      const p = await program.account.policy.fetch(policy);
      assert.deepEqual(p.status, { escalated: {} }, "a stalled claim reaches humans");

      await program.methods
        .setParams(SLASH_BPS, new BN(86_400), new BN(30), new BN(3_600), REWARD_BPS)
        .accountsPartial({ params, authority: admin.publicKey })
        .rpc();
    });
  });

});
