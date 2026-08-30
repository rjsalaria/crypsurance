/**
 * Top an operator's stake back up after a slash.
 *
 *   KEYPAIR_PATH=op.json node scripts/add-stake.js <amount>
 *   KEYPAIR_PATH=op.json node scripts/add-stake.js --to-min
 *
 * A slash is meant to cost something, not to end a career. Without a way back
 * an operator that gets one call wrong falls under min_stake, goes inactive,
 * and has to deregister and start over -- so the rational move after a single
 * mistake is to leave. --to-min restores exactly the shortfall.
 *
 * Only the operator itself can do this: the program binds the operator account
 * to the signer through its seeds, so nobody can stake on someone else's behalf
 * (or, more to the point, quietly bail out an operator that should be feeling
 * the loss).
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { makeConnection } = require("./rpc");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");

(async () => {
  const toMin = process.argv.includes("--to-min");
  const explicit = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!toMin && !explicit) {
    console.error("usage: KEYPAIR_PATH=op.json node scripts/add-stake.js <amount>|--to-min");
    process.exit(1);
  }

  const kpPath =
    process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config/solana/id.json");
  const me = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8")))
  );

  const connection = makeConnection(
    (process.env.RPC_URL || "https://api.devnet.solana.com").trim()
  );
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
  const stakeVault = pda([Buffer.from("stake_vault"), pool.toBuffer()]);
  const operator = pda([Buffer.from("operator"), pool.toBuffer(), me.publicKey.toBuffer()]);

  const reg = await program.account.registry.fetch(registry);
  const before = await program.account.operator.fetch(operator);
  const minStake = reg.minStake.toNumber();

  const amount = toMin
    ? Math.max(minStake - before.stake.toNumber(), 0)
    : Number(explicit);
  console.log(`operator ${me.publicKey.toBase58()}`);
  console.log(`   stake ${before.stake} · min ${minStake} · active ${before.active}`);
  if (amount === 0) {
    console.log("   already at or above the minimum, nothing to do");
    return;
  }
  console.log(`   adding ${amount}`);

  const operatorToken = getAssociatedTokenAddressSync(MINT, me.publicKey);
  const wallet = await getAccount(connection, operatorToken);
  if (Number(wallet.amount) / 1e9 < amount) {
    console.error(
      `   wallet holds ${Number(wallet.amount) / 1e9} SURETY, needs ${amount}`
    );
    process.exit(1);
  }

  const sig = await program.methods
    .addStake(new anchor.BN(amount))
    .accountsPartial({
      authority: me.publicKey,
      pool,
      registry,
      operator,
      stakeVault,
      operatorToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const after = await program.account.operator.fetch(operator);
  console.log(`   stake ${before.stake} -> ${after.stake} · active ${after.active}`);
  console.log(`   ${sig}`);
})().catch((e) => {
  console.error("add-stake failed:", e.message || e);
  process.exit(1);
});
