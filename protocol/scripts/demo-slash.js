/**
 * Drive one claim through the whole consensus mechanism with one operator
 * deliberately lying, and print the before/after balances.
 *
 *   HOLDER_KEYPAIR=... OPERATOR_KEYPAIRS=a.json,b.json,c.json \
 *     node scripts/demo-slash.js [--liar 2]
 *
 * Slashing is the one property that cannot be demonstrated by the honest path,
 * because nothing bad happens on the honest path. scripts/oracle.js always
 * commits the verdict the data supports, so proving an operator loses money for
 * a wrong verdict needs an operator that reports the wrong verdict on purpose.
 * That is the entire reason this exists, and it is why it is a separate script
 * rather than a flag on the oracle: the oracle should have no code path that
 * can lie.
 *
 * The liar keeps its stake above min_stake, so the operator set is not damaged
 * by running this. If it ever drops below, add_stake puts it back.
 *
 * Takes about six minutes -- the commit window is real and is not shortened
 * here, because a demo that relaxes the parameters proves the relaxed thing.
 *
 * Pass --policy <pubkey> to resume a claim this script already committed to
 * instead of buying another. The sealed verdicts are recovered from the
 * commitments themselves, so resuming needs to remember nothing.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { makeConnection, waitForChainTime } = require("./rpc");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const FLIGHT = "TEST-DELAY"; // deterministic truth: this flight IS delayed
const PAYOUT = 10_000;

const load = (p) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
const sha256 = (...parts) =>
  crypto.createHash("sha256").update(Buffer.concat(parts)).digest();
const saltFor = (kp, policy) => sha256(Buffer.from(kp.secretKey), policy.toBuffer());
const commitmentFor = (approved, salt, operatorAccount) =>
  sha256(Buffer.from([approved ? 1 : 0]), salt, operatorAccount.toBuffer());

const ui = (n) => (Number(n) / 1e9).toLocaleString();
const arg = (flag) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null;

(async () => {
  const liarIdx = Number(arg("--liar") ?? 2);
  const resumeArg = arg("--policy");
  const holderPath = process.env.HOLDER_KEYPAIR;
  const opPaths = (process.env.OPERATOR_KEYPAIRS || "").split(",").filter(Boolean);
  if (!holderPath || opPaths.length < 2) {
    console.error(
      "set HOLDER_KEYPAIR and OPERATOR_KEYPAIRS=a.json,b.json,c.json"
    );
    console.error(
      "the holder needs SURETY for the premium; the operators must be registered"
    );
    process.exit(1);
  }

  const holder = load(holderPath);
  const ops = opPaths.map(load);
  if (liarIdx < 0 || liarIdx >= ops.length) {
    console.error(`--liar ${liarIdx} is not one of the ${ops.length} operators`);
    process.exit(1);
  }

  const connection = makeConnection(
    (process.env.RPC_URL || "https://api.devnet.solana.com").trim()
  );
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(holder), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);
  const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const pool = pda([Buffer.from("pool")]);
  const registry = pda([Buffer.from("registry"), pool.toBuffer()]);
  const params = pda([Buffer.from("params"), pool.toBuffer()]);
  const vault = pda([Buffer.from("vault"), pool.toBuffer()]);
  const stakeVault = pda([Buffer.from("stake_vault"), pool.toBuffer()]);
  const opAccount = (kp) =>
    pda([Buffer.from("operator"), pool.toBuffer(), kp.publicKey.toBuffer()]);
  const attestOf = (policy, acct) =>
    pda([Buffer.from("attest"), policy.toBuffer(), acct.toBuffer()]);
  const tallyOf = (policy) => pda([Buffer.from("tally"), policy.toBuffer()]);

  const cfg = await program.account.params.fetch(params);
  const reg = await program.account.registry.fetch(registry);

  /** stake + wallet for every operator, so the diff at the end is provable. */
  async function snapshot() {
    const out = [];
    for (const kp of ops) {
      const o = await program.account.operator.fetch(opAccount(kp));
      let wallet = 0n;
      try {
        wallet = (
          await getAccount(connection, getAssociatedTokenAddressSync(MINT, kp.publicKey))
        ).amount;
      } catch {}
      out.push({
        key: kp.publicKey.toBase58(),
        stake: o.stake.toNumber(),
        wallet,
        active: o.active,
      });
    }
    return out;
  }

  const show = (rows, title) => {
    console.log("");
    console.log(title);
    for (const r of rows)
      console.log(
        `   ${r.key.slice(0, 8)}…  stake ${String(r.stake).padStart(6)}` +
          `  wallet ${ui(r.wallet).padStart(9)}  active ${r.active}`
      );
  };

  console.log("=".repeat(64));
  console.log("SLASHING DEMONSTRATION — devnet");
  console.log("=".repeat(64));
  console.log(`flight ${FLIGHT} is delayed, so the honest verdict is PAY.`);
  console.log(
    `operator ${ops[liarIdx].publicKey.toBase58().slice(0, 8)}… commits DENY on purpose.`
  );
  console.log(
    `threshold ${reg.threshold}/${reg.operatorCount} · slash ${cfg.slashBps / 100}%` +
      ` of stake · reward ${cfg.rewardBps / 100}% of premium`
  );

  const before = await snapshot();
  show(before, "BEFORE");

  /* ---- buy and commit, or pick up a claim already in flight ---- */
  const holderToken = getAssociatedTokenAddressSync(MINT, holder.publicKey);
  let policy;
  let verdicts;

  if (resumeArg) {
    policy = new PublicKey(resumeArg);
    // Recover what each operator sealed by testing both possibilities against
    // the commitment already on chain -- the same trick the oracle uses, and
    // the reason resuming needs to remember nothing.
    verdicts = [];
    for (const kp of ops) {
      const acct = opAccount(kp);
      const att = await program.account.attestation.fetch(attestOf(policy, acct));
      const salt = saltFor(kp, policy);
      const stored = Buffer.from(att.commitment);
      const guess = [true, false].find((g) => commitmentFor(g, salt, acct).equals(stored));
      if (guess === undefined) throw new Error(`cannot recover verdict for ${kp.publicKey}`);
      verdicts.push(guess);
    }
    console.log("");
    console.log(`resuming policy ${policy.toBase58()}`);
    console.log(
      "   sealed verdicts recovered: " +
        verdicts
          .map((v, i) => `${ops[i].publicKey.toBase58().slice(0, 8)}…=${v ? "PAY" : "DENY"}`)
          .join("  ")
    );
  } else {
    const nonce = new anchor.BN(Date.now());
    policy = pda([
      Buffer.from("policy"),
      holder.publicKey.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ]);
    const date = new Date().toISOString().slice(0, 10);

    const buySig = await program.methods
      .buyCover(nonce, FLIGHT, date, new anchor.BN(PAYOUT))
      .accountsPartial({
        holder: holder.publicKey,
        pool,
        policy,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const pol = await program.account.policy.fetch(policy);
    console.log("");
    console.log(`bought cover · payout ${PAYOUT} · premium ${pol.premium}`);
    console.log(`   policy ${policy.toBase58()}`);
    console.log(`   ${buySig}`);

    const fileSig = await program.methods
      .fileClaim()
      .accountsPartial({
        holder: holder.publicKey,
        policy,
        tally: tallyOf(policy),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("filed claim");
    console.log(`   ${fileSig}`);

    console.log("");
    console.log("COMMIT (sealed — nobody can see anyone else's verdict)");
    verdicts = ops.map((_, i) => i !== liarIdx);
    for (const [i, kp] of ops.entries()) {
      const acct = opAccount(kp);
      const sig = await program.methods
        .commitAttestation([...commitmentFor(verdicts[i], saltFor(kp, policy), acct)])
        .accountsPartial({
          authority: kp.publicKey,
          pool,
          registry,
          params,
          operator: acct,
          policy,
          tally: tallyOf(policy),
          attestation: attestOf(policy, acct),
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();
      console.log(
        `   ${kp.publicKey.toBase58().slice(0, 8)}… commits ${verdicts[i] ? "PAY " : "DENY"}` +
          `${i === liarIdx ? "   <- the lie" : "          "}  ${sig.slice(0, 16)}…`
      );
    }

    const opened = await program.account.claimTally.fetch(tallyOf(policy));
    console.log(
      `   tally reads ${opened.approvals}/${reg.threshold} approvals` +
        " — the commitments reveal nothing"
    );
  }

  const tally = tallyOf(policy);

  /* ---- wait for the commit window to close, by the CHAIN's clock ---- */
  // Not the local one. Every window in the program is checked against
  // Clock::get(), which lags wall time, so "300 seconds have passed here" is a
  // different claim from "the commit window has closed there".
  const opened = await program.account.claimTally.fetch(tally);
  console.log("");
  console.log("waiting for the commit window to close");
  await waitForChainTime(
    connection,
    opened.openedAt.toNumber() + cfg.commitWindow.toNumber() + 2,
    "commit window"
  );

  /* ---- reveal ---- */
  console.log("");
  console.log("REVEAL");
  for (const [i, kp] of ops.entries()) {
    const acct = opAccount(kp);
    const att = await program.account.attestation.fetch(attestOf(policy, acct));
    if (att.revealed) {
      console.log(`   ${kp.publicKey.toBase58().slice(0, 8)}… already revealed`);
      continue;
    }
    const sig = await program.methods
      .revealAttestation(verdicts[i], "testnet-simulated", [...saltFor(kp, policy)])
      .accountsPartial({
        authority: kp.publicKey,
        pool,
        params,
        operator: acct,
        policy,
        tally,
        attestation: attestOf(policy, acct),
      })
      .signers([kp])
      .rpc();
    console.log(
      `   ${kp.publicKey.toBase58().slice(0, 8)}… reveals ${verdicts[i] ? "PAY " : "DENY"}  ${sig}`
    );
  }

  /* ---- settle: the signer is deliberately arbitrary ---- */
  let settled = await program.account.policy.fetch(policy);
  if (Object.keys(settled.status)[0] === "requested") {
    const settleSig = await program.methods
      .settleClaim()
      .accountsPartial({
        cranker: holder.publicKey,
        pool,
        registry,
        policy,
        tally,
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    settled = await program.account.policy.fetch(policy);
    console.log("");
    console.log(`SETTLED ${Object.keys(settled.status)[0]}`);
    console.log(`   ${settleSig}`);
  }

  /* ---- resolve: credit the honest, slash the liar ---- */
  console.log("");
  console.log("RESOLVE");
  for (const kp of ops) {
    const acct = opAccount(kp);
    const att = await program.account.attestation.fetch(attestOf(policy, acct));
    if (att.resolved) {
      console.log(`   ${kp.publicKey.toBase58().slice(0, 8)}… already resolved`);
      continue;
    }
    const sig = await program.methods
      .resolveAttestation()
      .accountsPartial({
        cranker: holder.publicKey,
        pool,
        registry,
        params,
        policy,
        tally,
        attestation: attestOf(policy, acct),
        operator: acct,
        stakeVault,
        vault,
        operatorToken: getAssociatedTokenAddressSync(MINT, kp.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`   ${kp.publicKey.toBase58().slice(0, 8)}…  ${sig}`);
  }

  const after = await snapshot();
  show(after, "AFTER");

  console.log("");
  console.log("CHANGE");
  for (const [i, a] of after.entries()) {
    const b = before[i];
    const dStake = a.stake - b.stake;
    const dWallet = Number(a.wallet - b.wallet) / 1e9;
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    console.log(
      `   ${a.key.slice(0, 8)}… ${verdicts[i] ? "said PAY  (right)" : "said DENY (wrong)"}` +
        `  stake ${sign(dStake)}  wallet ${sign(dWallet)}`
    );
  }
  console.log("");
  console.log(`policy ${policy.toBase58()}`);
  console.log(`https://explorer.solana.com/address/${policy.toBase58()}?cluster=devnet`);
})().catch((e) => {
  console.error("demo-slash failed:", e.message || e);
  process.exit(1);
});
