/**
 * One-time setup: create the operator registry and its stake vault.
 *
 *   RPC_URL=... node scripts/init-registry.js [threshold] [minStake]
 *
 * Defaults: threshold 2, minimum stake 1000 SURETY.
 *
 * The registry is a separate account from the pool on purpose — the pool was
 * already live holding policy counters and a funded vault, and growing a
 * money-holding account in place is a migration rather than a feature.
 *
 * Safe to re-run: reports existing state instead of failing.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");

(async () => {
  const threshold = Number(process.argv[2] || 2);
  const minStake = Number(process.argv[3] || 1000);

  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const kpPath =
    process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config/solana/id.json");

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    program.programId
  );
  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), pool.toBuffer()],
    program.programId
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), pool.toBuffer()],
    program.programId
  );

  console.log("program     :", program.programId.toBase58());
  console.log("authority   :", payer.publicKey.toBase58());
  console.log("registry    :", registry.toBase58());
  console.log("stake vault :", stakeVault.toBase58());
  console.log();

  if (await connection.getAccountInfo(registry)) {
    const r = await program.account.registry.fetch(registry);
    console.log("registry already initialized:");
    console.log("  threshold :", r.threshold);
    console.log("  min stake :", r.minStake.toString(), "SURETY");
    console.log("  operators :", r.operatorCount);
    return;
  }

  const sig = await program.methods
    .initializeRegistry(threshold, new anchor.BN(minStake))
    .accountsPartial({
      authority: payer.publicKey,
      pool,
      registry,
      stakeVault,
      mint: MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("initialized ✓");
  console.log("  tx:", sig);
  console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  const r = await program.account.registry.fetch(registry);
  console.log();
  console.log("on-chain state:");
  console.log("  threshold :", r.threshold, `(of ${r.operatorCount} operators)`);
  console.log("  min stake :", r.minStake.toString(), "SURETY");
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
