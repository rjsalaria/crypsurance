/**
 * CrypSurance claims operator — commits, reveals, settles and resolves.
 *
 *   RPC_URL=... KEYPAIR_PATH=... node scripts/oracle.js [--dry-run]
 *
 * Runs in Node rather than the Cloudflare Worker because no RPC available to
 * us serves account reads from Cloudflare's IP ranges: Helius' free tier
 * rejects getAccountInfo/getMultipleAccounts/getProgramAccounts outright, and
 * Solana's public RPC blocks Cloudflare. From a normal host the public RPC
 * answers all of them, so the operator lives here and the Worker keeps the
 * faucet, the RPC proxy and the heartbeat.
 *
 * This process is one registered operator among several, not the oracle. It
 * attests; it does not decide. A claim settles only when the registry's
 * threshold of operators agree, and the crank that triggers settlement is
 * permissionless — running it here is convenience, not authority. The payout
 * still goes to the policy's own holder from a program-owned vault.
 *
 * ── Why there is no state file ────────────────────────────────────────────
 * Verdicts are sealed: an operator commits sha256(verdict, salt, operator) and
 * reveals only after the commit window closes. That normally means keeping a
 * salt between two runs — impossible here, because each scheduled run is a
 * fresh CI container with nothing carried over.
 *
 * So the salt is *derived* rather than stored: sha256(secret key, policy). It
 * is reproducible on any run, unique per claim, and underivable by anyone
 * without this operator's key.
 *
 * The verdict itself is recovered the same way. At reveal time we do not
 * re-query the flight API — if the feed had changed its answer we would reveal
 * something that no longer matches the commitment, and the reveal would be
 * rejected. Instead we take the commitment already on chain and test it
 * against both possible verdicts. Only one matches, and that is what we
 * committed to. A verdict is one bit; knowing the salt is what makes it
 * recoverable, and only we know the salt.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const anchor = require("@coral-xyz/anchor");
const { makeConnection, retryingFetch } = require("./rpc");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const SURETY_MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const DELAY_THRESHOLD_MIN = 180;
const DRY_RUN = process.argv.includes("--dry-run");

function clean(v, name) {
  if (!v) return v;
  let s = String(v).trim().replace(/^["']|["']$/g, "").trim();
  if (name && s.startsWith(name + "=")) s = s.slice(name.length + 1).trim();
  return s;
}

const sha256 = (...parts) =>
  crypto.createHash("sha256").update(Buffer.concat(parts)).digest();

/** Reproducible per (operator, policy), and secret to this operator. */
const saltFor = (kp, policy) =>
  sha256(Buffer.from(kp.secretKey), policy.toBuffer());

/** Must match the program byte for byte. */
const commitmentFor = (approved, salt, operatorAccount) =>
  sha256(Buffer.from([approved ? 1 : 0]), salt, operatorAccount.toBuffer());

async function verifyFlight(flight, date, apiKey) {
  if (flight.startsWith("TEST-DELAY"))
    return { delayed: true, basis: "testnet-simulated" };
  if (flight.startsWith("TEST-ONTIME"))
    return { delayed: false, basis: "testnet-simulated" };
  if (!apiKey)
    return { skip: true, reason: "real flight, no AVIATIONSTACK_KEY set" };

  // Free tier rejects the flight_date param, so query by flight number and
  // match the date here.
  const url = `https://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flight)}`;
  let j;
  try {
    j = await (await retryingFetch(url)).json();
  } catch (e) {
    // A flight lookup that cannot complete is not a verdict — but it is also
    // not a reason to abandon the run. Everything this operator could have
    // attested to would stall along with it, for the half hour until the next
    // scheduled run. The API sits behind Cloudflare, so a throttled response
    // can be an HTML block page that blows up .json() rather than the clean
    // error envelope handled below.
    return { skip: true, reason: `flight-data API unreachable: ${e.message}` };
  }
  if (j?.error) {
    return {
      skip: true,
      reason: `flight-data API: ${j.error.code ?? j.error.type ?? "error"}`,
    };
  }
  const recs = Array.isArray(j?.data) ? j.data : [];
  if (recs.length === 0)
    return { skip: true, reason: "flight not found in data feed" };
  const rec = recs.find((r) => r.flight_date === date);
  if (!rec) {
    const seen = [...new Set(recs.map((r) => r.flight_date))].join(", ");
    return { skip: true, reason: `no record for ${date} (feed: ${seen || "none"})` };
  }
  const delayMin = Math.max(rec.departure?.delay ?? 0, rec.arrival?.delay ?? 0);
  return {
    delayed: delayMin >= DELAY_THRESHOLD_MIN,
    basis: `aviationstack ${rec.flight_date} delay=${delayMin}min`.slice(0, 64),
  };
}

(async () => {
  const rpc = clean(process.env.RPC_URL, "RPC_URL") || "https://api.devnet.solana.com";
  const apiKey = clean(process.env.AVIATIONSTACK_KEY, "AVIATIONSTACK_KEY");
  const kpPath =
    process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config/solana/id.json");

  const me = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const connection = makeConnection(rpc);
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(me), {
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
  const stakeVault = pda([Buffer.from("stake_vault"), pool.toBuffer()]);
  const vault = pda([Buffer.from("vault"), pool.toBuffer()]);
  const operatorAccount = pda([
    Buffer.from("operator"),
    pool.toBuffer(),
    me.publicKey.toBuffer(),
  ]);
  // the account a correct verdict is paid into — the same one the stake came
  // from, created when this key registered
  const myAta = await getAssociatedTokenAddress(SURETY_MINT, me.publicKey);

  const op = await connection.getAccountInfo(operatorAccount);
  if (!op) {
    console.error(
      `not a registered operator: ${me.publicKey.toBase58()}\n` +
        "run scripts/register-operators.js first — attesting is the only way to influence a claim"
    );
    process.exit(1);
  }

  const cfg = await program.account.params.fetch(params);
  const reg = await program.account.registry.fetch(registry);
  const now = Math.floor(Date.now() / 1000);

  const all = await program.account.policy.all();
  const status = (a) => Object.keys(a.status)[0];
  const open = all.filter((p) => ["requested", "escalated"].includes(status(p.account)));
  const settled = all.filter((p) => ["paid", "denied"].includes(status(p.account)));

  console.log(
    `${all.length} policies · ${open.length} open · operator ${me.publicKey
      .toBase58()
      .slice(0, 8)}…${DRY_RUN ? "  (dry run)" : ""}`
  );

  /* ---------------- 1. commit a sealed verdict ---------------------- */
  for (const { publicKey: policy, account: a } of open) {
    const attestation = pda([
      Buffer.from("attest"),
      policy.toBuffer(),
      operatorAccount.toBuffer(),
    ]);
    if (await connection.getAccountInfo(attestation)) continue; // already committed

    const tally = await program.account.claimTally.fetch(
      pda([Buffer.from("tally"), policy.toBuffer()])
    );
    if (now >= tally.openedAt.toNumber() + cfg.commitWindow.toNumber()) {
      console.log(`  ${a.flight} ${a.date} -> commit window closed, cannot vote`);
      continue;
    }

    const verdict = await verifyFlight(a.flight, a.date, apiKey);
    if (verdict.skip) {
      console.log(`? ${a.flight} ${a.date} -> no verdict (${verdict.reason})`);
      continue;
    }

    console.log(
      `⊕ ${a.flight} ${a.date} -> commit ${verdict.delayed ? "PAY" : "DENY"} (sealed)`
    );
    if (DRY_RUN) continue;

    const salt = saltFor(me, policy);
    const sig = await program.methods
      .commitAttestation([...commitmentFor(verdict.delayed, salt, operatorAccount)])
      .accountsPartial({
        authority: me.publicKey,
        pool,
        registry,
        params,
        operator: operatorAccount,
        policy,
        tally: pda([Buffer.from("tally"), policy.toBuffer()]),
        attestation,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`   committed ${sig}`);
  }

  /* ---------------- 2. reveal once the window closes ---------------- */
  // Deliberately every policy, not just the open ones. A claim settles as soon
  // as the threshold is reached, which can happen while other operators are
  // still holding sealed commitments. reveal_attestation does not care whether
  // the policy settled -- it checks the commitment and the window and nothing
  // else -- and an operator that never reveals is slashed as a no-show. Iterate
  // only the open claims and you slash honest operators for being slow rather
  // than wrong, which is the exact failure this whole mechanism exists to
  // avoid.
  for (const { publicKey: policy, account: a } of all) {
    const attestationPda = pda([
      Buffer.from("attest"),
      policy.toBuffer(),
      operatorAccount.toBuffer(),
    ]);
    const info = await connection.getAccountInfo(attestationPda);
    if (!info) continue;

    const att = await program.account.attestation.fetch(attestationPda);
    if (att.revealed) continue;

    const tally = await program.account.claimTally.fetch(
      pda([Buffer.from("tally"), policy.toBuffer()])
    );
    const commitCloses = tally.openedAt.toNumber() + cfg.commitWindow.toNumber();
    const revealCloses = commitCloses + cfg.revealWindow.toNumber();
    if (now < commitCloses) {
      const mins = Math.ceil((commitCloses - now) / 60);
      console.log(`  ${a.flight} ${a.date} -> sealed, reveal opens in ${mins} min`);
      continue;
    }
    if (now >= revealCloses) {
      console.log(`  ${a.flight} ${a.date} -> reveal window missed; this vote will be slashed`);
      continue;
    }

    // Recover what we committed to by testing both possibilities against the
    // commitment already on chain. No stored state, no second API call.
    const salt = saltFor(me, policy);
    const stored = Buffer.from(att.commitment);
    let approved = null;
    for (const guess of [true, false]) {
      if (commitmentFor(guess, salt, operatorAccount).equals(stored)) {
        approved = guess;
        break;
      }
    }
    if (approved === null) {
      console.log(
        `  ${a.flight} ${a.date} -> cannot recover our own verdict (wrong key?), skipping`
      );
      continue;
    }

    console.log(`⊙ ${a.flight} ${a.date} -> reveal ${approved ? "PAY" : "DENY"}`);
    if (DRY_RUN) continue;

    const basis = a.flight.startsWith("TEST-") ? "testnet-simulated" : "verified by operator";
    const sig = await program.methods
      .revealAttestation(approved, basis, [...salt])
      .accountsPartial({
        authority: me.publicKey,
        pool,
        params,
        operator: operatorAccount,
        policy,
        tally: pda([Buffer.from("tally"), policy.toBuffer()]),
        attestation: attestationPda,
      })
      .rpc();
    console.log(`   revealed ${sig}`);
  }

  /* ---------------- 3. settle anything that has quorum -------------- */
  for (const { publicKey: policy, account: a } of open) {
    const tally = await program.account.claimTally.fetch(
      pda([Buffer.from("tally"), policy.toBuffer()])
    );
    if (tally.approvals < reg.threshold && tally.denials < reg.threshold) {
      console.log(
        `  ${a.flight} ${a.date} -> ${tally.approvals}/${reg.threshold} approvals, ${tally.denials} denials — waiting`
      );
      continue;
    }

    console.log(`✓ ${a.flight} ${a.date} -> threshold met, settling`);
    if (DRY_RUN) continue;

    const holderToken = await getAssociatedTokenAddress(SURETY_MINT, a.holder);
    const sig = await program.methods
      .settleClaim()
      .accountsPartial({
        cranker: me.publicKey,
        pool,
        registry,
        policy,
        tally: pda([Buffer.from("tally"), policy.toBuffer()]),
        vault,
        holderToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`   settled ${sig}`);
  }

  /* ---------------- 4. take our credit, or our slash ---------------- */
  for (const { publicKey: policy } of settled) {
    const attestationPda = pda([
      Buffer.from("attest"),
      policy.toBuffer(),
      operatorAccount.toBuffer(),
    ]);
    if (!(await connection.getAccountInfo(attestationPda))) continue;
    const att = await program.account.attestation.fetch(attestationPda);
    if (att.resolved) continue;
    // Accounts written before commit-reveal are shorter than the current
    // layout, so they read back as zeros rather than failing. The program
    // rejects them; skip them here too, or every run dies on the same four.
    if (att.createdAt.toNumber() === 0) {
      console.log(`  ${policy.toBase58().slice(0, 8)}… -> pre-migration attestation, ignored`);
      continue;
    }

    // An unrevealed commitment is only a no-show once the window has shut. The
    // program enforces this, so attempting it early is a guaranteed failure --
    // and one that used to abort the whole run, taking every later claim with
    // it. It is a normal state, not an error.
    if (!att.revealed) {
      const tally = await program.account.claimTally.fetch(
        pda([Buffer.from("tally"), policy.toBuffer()])
      );
      const revealCloses =
        tally.openedAt.toNumber() +
        cfg.commitWindow.toNumber() +
        cfg.revealWindow.toNumber();
      if (now < revealCloses) {
        const mins = Math.ceil((revealCloses - now) / 60);
        console.log(
          `  ${policy.toBase58().slice(0, 8)}… -> unrevealed, ${mins} min left to reveal`
        );
        continue;
      }
    }

    console.log(`⚖ ${policy.toBase58().slice(0, 8)}… -> judging our own verdict`);
    if (DRY_RUN) continue;

    const sig = await program.methods
      .resolveAttestation()
      .accountsPartial({
        cranker: me.publicKey,
        pool,
        registry,
        params,
        policy,
        attestation: attestationPda,
        operator: operatorAccount,
        stakeVault,
        vault,
        // where a correct verdict gets paid: our own token account
        operatorToken: myAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`   resolved ${sig}`);
  }

  console.log("done");
})().catch((e) => {
  console.error("oracle failed:", e.message || e);
  process.exit(1);
});
