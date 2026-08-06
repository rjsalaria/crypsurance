/**
 * One-time setup: create the pool and its program-owned vault on devnet.
 *
 *   RPC_URL=... node scripts/init-pool.js
 *
 * Binds three roles deliberately:
 *   authority — the deploy key, offline, may rotate the oracle
 *   oracle    — the Cloudflare Worker's key; may settle claims and nothing else
 *   mint      — SURETY devnet
 *
 * Safe to re-run: it reports existing state instead of failing.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const ORACLE = new PublicKey("9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy");

(async () => {
  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const kpPath =
    process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config/solana/id.json");

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );

  console.log("program  :", program.programId.toBase58());
  console.log("authority:", payer.publicKey.toBase58());
  console.log("pool PDA :", pool.toBase58());
  console.log("vault PDA:", vault.toBase58());
  console.log();

  if (await connection.getAccountInfo(pool)) {
    const p = await program.account.pool.fetch(pool);
    console.log("pool already initialized:");
    console.log("  oracle   :", p.oracle.toBase58());
    console.log("  mint     :", p.mint.toBase58());
    console.log("  decimals :", p.decimals);
    console.log("  policies :", p.policies.toString());
    return;
  }

  const sig = await program.methods
    .initializePool(ORACLE)
    .accountsPartial({
      authority: payer.publicKey,
      pool,
      vault,
      mint: MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("initialized ✓");
  console.log("  tx:", sig);
  console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  const p = await program.account.pool.fetch(pool);
  console.log();
  console.log("on-chain state:");
  console.log("  authority:", p.authority.toBase58());
  console.log("  oracle   :", p.oracle.toBase58());
  console.log("  mint     :", p.mint.toBase58());
  console.log("  decimals :", p.decimals);
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
