/**
 * CrypSurance claims oracle — reads Policy accounts and settles them.
 *
 *   RPC_URL=... KEYPAIR_PATH=... node scripts/oracle.js [--dry-run]
 *
 * Runs in Node rather than the Cloudflare Worker because no RPC available to
 * us serves account reads from Cloudflare's IP ranges: Helius' free tier
 * rejects getAccountInfo/getMultipleAccounts/getProgramAccounts outright, and
 * Solana's public RPC blocks Cloudflare. From a normal host the public RPC
 * answers all of them, so the oracle lives here and the Worker keeps the
 * faucet, the RPC proxy and the heartbeat.
 *
 * As of M3 this process is one registered operator among several, not the
 * oracle. It attests; it does not decide. Settlement happens only when the
 * registry's threshold of operators agree, and the crank that triggers it is
 * permissionless — running it here is convenience, not authority. The payout
 * still goes to the policy's own holder from a program-owned vault.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection, SystemProgram } = require("@solana/web3.js");
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
  const j = await (await fetch(url)).json();
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
  const kpPath = process.env.KEYPAIR_PATH;
  if (!kpPath) throw new Error("set KEYPAIR_PATH to the oracle keypair");

  const oracle = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(oracle),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // idl/ is committed; target/ is a build artifact and absent in CI.
  const idlPath = [
    path.join(__dirname, "../idl/protocol.json"),
    path.join(__dirname, "../target/idl/protocol.json"),
  ].find((p) => fs.existsSync(p));
  if (!idlPath) throw new Error("protocol IDL not found");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );

  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), pool.toBuffer()],
    program.programId
  );

  const all = await program.account.policy.all();
  const status = (a) => Object.keys(a.status)[0];
  const pending = all.filter((p) => status(p.account) === "requested");
  const awaiting = all.filter((p) => status(p.account) === "escalated");

  console.log(
    `${all.length} policies · ${pending.length} pending · ${awaiting.length} awaiting offline verification${DRY_RUN ? "  (dry run)" : ""}`
  );

  for (const { publicKey: policy, account: a } of pending) {
    const holderToken = await getAssociatedTokenAddress(SURETY_MINT, a.holder);
    const [tally] = PublicKey.findProgramAddressSync(
      [Buffer.from("tally"), policy.toBuffer()],
      program.programId
    );
    const [operatorAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), pool.toBuffer(), oracle.publicKey.toBuffer()],
      program.programId
    );
    const [attestation] = PublicKey.findProgramAddressSync(
      [Buffer.from("attest"), policy.toBuffer(), operatorAccount.toBuffer()],
      program.programId
    );

    const verdict = await verifyFlight(a.flight, a.date, apiKey);

    // Inconclusive data escalates to human verification rather than guessing.
    // On-chain status caps the paid flight API at one call per claim: once
    // escalated the policy is no longer `requested`, so it is never re-checked.
    if (verdict.skip) {
      console.log(`? ${a.flight} ${a.date} -> ESCALATE (${verdict.reason})`);
      if (DRY_RUN) continue;
      const sig = await program.methods
        .escalateClaim(verdict.reason.slice(0, 64))
        .accountsPartial({ oracle: oracle.publicKey, pool, policy })
        .rpc();
      console.log(`   ${sig}`);
      continue;
    }

    console.log(
      `${verdict.delayed ? "✓" : "✗"} ${a.flight} ${a.date} -> ${verdict.delayed ? "PAY" : "DENY"} ${a.payout} SURETY [${verdict.basis}]`
    );
    if (DRY_RUN) continue;

    // Attest, unless this operator already has. Its own vote settles nothing:
    // the program counts attestations and only pays once the registry's
    // threshold agrees.
    if (!(await connection.getAccountInfo(attestation))) {
      const sig = await program.methods
        .attestClaim(verdict.delayed, verdict.basis)
        .accountsPartial({
          authority: oracle.publicKey,
          pool,
          registry,
          operator: operatorAccount,
          policy,
          tally,
          attestation,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`   attested ${sig}`);
    } else {
      console.log("   already attested");
    }

    // Then crank settlement if the threshold is now met. Anyone may do this —
    // running it here is convenience, not authority.
    const t = await program.account.claimTally.fetch(tally);
    const reg = await program.account.registry.fetch(registry);
    if (t.approvals >= reg.threshold || t.denials >= reg.threshold) {
      const sig = await program.methods
        .settleClaim()
        .accountsPartial({
          cranker: oracle.publicKey,
          pool,
          registry,
          policy,
          tally,
          vault,
          holderToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(`   settled ${sig}`);
    } else {
      console.log(
        `   ${t.approvals}/${reg.threshold} approvals — waiting for other operators`
      );
    }
  }

  console.log("done");
})().catch((e) => {
  console.error("oracle failed:", e.message || e);
  process.exit(1);
});
