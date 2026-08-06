/**
 * End-to-end exercise of the deployed program: buy cover, then file a claim,
 * leaving a policy in `requested` for the oracle to settle.
 *
 *   RPC_URL=... KEYPAIR_PATH=... node scripts/demo-claim.js [FLIGHT]
 *
 * Defaults to TEST-DELAY, which the oracle always verifies as delayed.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection, SystemProgram } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  getAccount,
} = require("@solana/spl-token");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");

(async () => {
  const flight = process.argv[2] || "TEST-DELAY";
  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const kpPath = process.env.KEYPAIR_PATH;
  if (!kpPath) throw new Error("set KEYPAIR_PATH");

  const holder = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(holder),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );
  const holderToken = await getAssociatedTokenAddress(MINT, holder.publicKey);

  const nonce = new anchor.BN(Date.now());
  const [policy] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), holder.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const before = await getAccount(connection, holderToken);
  console.log("holder :", holder.publicKey.toBase58());
  console.log("balance:", (before.amount / 1_000_000_000n).toString(), "SURETY");
  console.log();

  const date = new Date().toISOString().slice(0, 10);
  const buySig = await program.methods
    .buyCover(nonce, flight, date, new anchor.BN(10_000))
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
  console.log(`bought cover  ${flight} · payout 10,000 SURETY`);
  console.log("  policy:", policy.toBase58());
  console.log("  tx    :", buySig);

  const claimSig = await program.methods
    .fileClaim()
    .accountsPartial({ holder: holder.publicKey, policy })
    .rpc();
  console.log("filed claim");
  console.log("  tx    :", claimSig);

  const p = await program.account.policy.fetch(policy);
  const after = await getAccount(connection, holderToken);
  console.log();
  console.log("status :", Object.keys(p.status)[0]);
  console.log("premium:", p.premium.toString(), "SURETY");
  console.log("paid   :", ((before.amount - after.amount) / 1_000_000_000n).toString(), "SURETY");
  console.log();
  console.log("now run the oracle to settle it.");
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
