/**
 * Move SURETY from the treasury wallet into the program-owned vault, so the
 * protocol can pay claims.
 *
 *   RPC_URL=... KEYPAIR_PATH=... node scripts/seed-vault.js [amount]
 *
 * This is a one-way door by design: once the tokens are in the vault, the
 * program is the only thing that can move them, and only to a policy holder
 * via settle_claim. There is deliberately no withdraw instruction.
 */
const fs = require("fs");
const {
  PublicKey,
  Keypair,
  Connection,
  Transaction,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} = require("@solana/spl-token");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const PROGRAM = new PublicKey("4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr");
const DECIMALS = 9n;

(async () => {
  const amountUi = BigInt(process.argv[2] || "5000000"); // whole SURETY
  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const kpPath = process.env.KEYPAIR_PATH;
  if (!kpPath) throw new Error("set KEYPAIR_PATH to the treasury wallet keypair");

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );
  const conn = new Connection(rpc, "confirmed");

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    PROGRAM
  );
  const from = await getAssociatedTokenAddress(MINT, payer.publicKey);

  const before = await getAccount(conn, vault);
  console.log("vault  :", vault.toBase58());
  console.log("owner  :", before.owner.toBase58(), "(the pool PDA)");
  console.log("balance:", (before.amount / 10n ** DECIMALS).toString(), "SURETY");

  const tx = new Transaction().add(
    createTransferInstruction(
      from,
      vault,
      payer.publicKey,
      amountUi * 10n ** DECIMALS
    )
  );
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error("transfer failed: " + JSON.stringify(st.err));
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized")
      break;
  }

  const after = await getAccount(conn, vault);
  console.log();
  console.log("seeded ✓", amountUi.toString(), "SURETY");
  console.log("new vault balance:", (after.amount / 10n ** DECIMALS).toString(), "SURETY");
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
