/**
 * Register the sprint's operators on devnet.
 *
 *   RPC_URL=... TREASURY_KEYPAIR=/path/to/treasury.json \
 *     node scripts/register-operators.js [count] [stake]
 *
 * Defaults: 3 operators, 5000 SURETY staked each.
 *
 * Keys are generated once into protocol/.operators/ (gitignored) and reused on
 * re-runs, so the operator identities stay stable across the sprint — week 4
 * moves these same keys onto separate infrastructure.
 *
 * Funding comes from two places, deliberately:
 *   SOL    — the payer, for fees and account rent
 *   SURETY — the treasury, because the mint authority is revoked and no more
 *            can ever be created
 *
 * Safe to re-run: already-registered operators are reported and skipped.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const {
  PublicKey,
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAccount,
} = require("@solana/spl-token");

const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const DECIMALS = 9n;
const SOL_PER_OPERATOR = 0.05; // fees + the Operator account's rent
const KEY_DIR = path.join(__dirname, "../.operators");

const base = (n) => BigInt(n) * 10n ** DECIMALS;

/** Load operator keypair `i`, creating and saving it the first time. */
function operatorKey(i) {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const file = path.join(KEY_DIR, `operator-${i}.json`);
  if (fs.existsSync(file)) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))
    );
  }
  const kp = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify([...kp.secretKey]));
  console.log(`  generated ${path.basename(file)} (gitignored)`);
  return kp;
}

(async () => {
  const count = Number(process.argv[2] || 3);
  const stake = Number(process.argv[3] || 5000);

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
  const treasuryPath = process.env.TREASURY_KEYPAIR;
  if (!treasuryPath) throw new Error("set TREASURY_KEYPAIR to the SURETY holder's keypair");
  const treasury = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(treasuryPath, "utf8")))
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

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), pool.toBuffer()],
    program.programId
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), pool.toBuffer()],
    program.programId
  );

  const r = await program.account.registry.fetch(registry);
  console.log("registry  :", registry.toBase58());
  console.log("threshold :", r.threshold, "| min stake:", r.minStake.toString());
  console.log("payer     :", payer.publicKey.toBase58());
  console.log("treasury  :", treasury.publicKey.toBase58());
  console.log();

  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, MINT, treasury.publicKey
  );

  for (let i = 1; i <= count; i++) {
    const op = operatorKey(i);
    const [operatorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), pool.toBuffer(), op.publicKey.toBuffer()],
      program.programId
    );

    console.log(`operator ${i}: ${op.publicKey.toBase58()}`);

    if (await connection.getAccountInfo(operatorPda)) {
      const o = await program.account.operator.fetch(operatorPda);
      console.log(`  already registered — stake ${o.stake.toString()} SURETY`);
      continue;
    }

    // SOL for fees and the Operator account's rent
    const bal = await connection.getBalance(op.publicKey);
    if (bal < SOL_PER_OPERATOR * LAMPORTS_PER_SOL) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: op.publicKey,
          lamports: Math.floor(SOL_PER_OPERATOR * LAMPORTS_PER_SOL) - bal,
        })
      );
      await provider.sendAndConfirm(tx, []);
      console.log(`  funded ${SOL_PER_OPERATOR} SOL`);
    }

    // SURETY to stake
    const opAta = await getOrCreateAssociatedTokenAccount(
      connection, payer, MINT, op.publicKey
    );
    const held = (await getAccount(connection, opAta.address)).amount;
    if (held < base(stake)) {
      const tx = new Transaction().add(
        createTransferInstruction(
          treasuryAta.address,
          opAta.address,
          treasury.publicKey,
          base(stake) - held
        )
      );
      await provider.sendAndConfirm(tx, [treasury]);
      console.log(`  funded ${stake} SURETY`);
    }

    const sig = await program.methods
      .registerOperator(new anchor.BN(stake))
      .accountsPartial({
        authority: op.publicKey,
        pool,
        registry,
        operator: operatorPda,
        stakeVault,
        operatorToken: opAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([op])
      .rpc();

    console.log(`  registered ✓ ${stake} SURETY staked`);
    console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }

  const after = await program.account.registry.fetch(registry);
  const vault = await getAccount(connection, stakeVault);
  console.log();
  console.log("registry now:");
  console.log("  operators   :", after.operatorCount);
  console.log("  threshold   :", after.threshold, `of ${after.operatorCount}`);
  console.log("  stake vault :", (vault.amount / 10n ** DECIMALS).toString(), "SURETY");
  console.log("  vault owner :", vault.owner.toBase58(), vault.owner.equals(pool) ? "(pool PDA ✓)" : "(!)");
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
