/**
 * Judge every attestation that is still outstanding, and report what is left.
 *
 *   RPC_URL=... node scripts/resolve-outstanding.js [--dry-run]
 *
 * Written for the commit-reveal migration: an operator's `pending` count can
 * only be cleared by the program, so any attestation left unjudged when the
 * Attestation layout changes would strand that operator's stake permanently.
 * Run this to zero, verify, and only then deploy a layout change.
 *
 * Permissionless by design — the signer here pays fees and nothing else.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const { makeConnection } = require("./rpc");

const DRY_RUN = process.argv.includes("--dry-run");

(async () => {
  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(
          process.env.KEYPAIR_PATH ||
            path.join(process.env.HOME, ".config/solana/id.json"),
          "utf8"
        )
      )
    )
  );
  const connection = makeConnection(rpc);
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), pool.toBuffer()],
    program.programId
  );
  const [params] = PublicKey.findProgramAddressSync(
    [Buffer.from("params"), pool.toBuffer()],
    program.programId
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), pool.toBuffer()],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );

  const mint = (await program.account.pool.fetch(pool)).mint;

  const attestations = await program.account.attestation.all();
  const policies = new Map(
    (await program.account.policy.all()).map((p) => [p.publicKey.toBase58(), p.account])
  );
  const status = (a) => Object.keys(a.status)[0];

  const outstanding = attestations.filter((a) => !a.account.resolved);
  console.log(
    `${attestations.length} attestations · ${outstanding.length} unjudged${DRY_RUN ? "  (dry run)" : ""}`
  );

  for (const { publicKey: attestation, account: a } of outstanding) {
    const policy = policies.get(a.policy.toBase58());
    if (!policy) {
      console.log(`  ${attestation.toBase58().slice(0, 8)}…  policy missing — skipped`);
      continue;
    }
    const st = status(policy);
    if (st !== "paid" && st !== "denied") {
      console.log(`  ${attestation.toBase58().slice(0, 8)}…  policy is ${st} — not settled yet`);
      continue;
    }

    const agreed = a.approved === (st === "paid");
    console.log(
      `  ${attestation.toBase58().slice(0, 8)}…  said ${a.approved ? "pay" : "deny"}, settled ${st} -> ${agreed ? "CREDIT" : "SLASH"}`
    );
    if (DRY_RUN) continue;

    const sig = await program.methods
      .resolveAttestation()
      .accountsPartial({
        cranker: payer.publicKey,
        pool,
        registry,
        params,
        policy: a.policy,
        attestation,
        operator: a.operator,
        stakeVault,
        vault,
        // the reward is constrained to the operator's own authority, so this
        // has to be looked up per attestation rather than assumed to be ours
        operatorToken: getAssociatedTokenAddressSync(
          mint,
          (await program.account.operator.fetch(a.operator)).authority
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`     ${sig}`);
  }

  const operators = await program.account.operator.all();
  const stillPending = operators.filter((o) => o.account.pending > 0);
  console.log();
  console.log("operators with unjudged verdicts:", stillPending.length);
  for (const { account: o } of operators) {
    console.log(
      `  ${o.authority.toBase58().slice(0, 8)}…  stake ${o.stake}  pending ${o.pending}  agreed ${o.agreed}`
    );
  }
  if (stillPending.length === 0) {
    console.log("\nnothing outstanding — safe to change the Attestation layout");
  } else {
    console.log("\nDO NOT deploy a layout change yet: those counts can only be cleared on-chain");
  }
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
