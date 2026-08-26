/**
 * Read, migrate and set the protocol's tunable parameters.
 *
 *   RPC_URL=... node scripts/params.js                 # show what is live
 *   RPC_URL=... node scripts/params.js --apply         # migrate + write
 *
 * The account is written by the pool authority only, so this needs the admin
 * key — everything else in scripts/ is permissionless.
 *
 * Three states have to be handled, because Params is live and gained a field:
 *
 *   missing  -> initialize_params
 *   short    -> migrate_params (resize), then set_params
 *   current  -> set_params
 *
 * The resize and the value change are deliberately two transactions. A
 * migration that also changed a policy would be impossible to review, and
 * impossible to half-undo if the values turned out wrong.
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection, SystemProgram } = require("@solana/web3.js");

const APPLY = process.argv.includes("--apply");

// Defaults are the values devnet already runs, plus the new reward share.
const num = (name, fallback) =>
  process.env[name] === undefined ? fallback : Number(process.env[name]);
const SLASH_BPS = num("SLASH_BPS", 1000); // 10% of stake, per wrong verdict
const DISPUTE_WINDOW = num("DISPUTE_WINDOW", 86_400); // 24h to escalate a stall
const COMMIT_WINDOW = num("COMMIT_WINDOW", 300); // 5m sealed
const REVEAL_WINDOW = num("REVEAL_WINDOW", 3_600); // 1h to open the envelope
const REWARD_BPS = num("REWARD_BPS", 3000); // 30% of a premium, split across the set

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
  const [params] = PublicKey.findProgramAddressSync(
    [Buffer.from("params"), pool.toBuffer()],
    program.programId
  );

  const authority = (await program.account.pool.fetch(pool)).authority;
  if (!authority.equals(payer.publicKey)) {
    console.error(
      `this key cannot set parameters\n  signer    ${payer.publicKey.toBase58()}\n  authority ${authority.toBase58()}`
    );
    process.exit(1);
  }

  // Size the current struct the way the program does: 8 bytes of discriminator
  // plus the fields.
  const fields = idl.types.find((t) => t.name === "Params").type.fields;
  const WIDTH = { pubkey: 32, u16: 2, i64: 8, u8: 1 };
  const needed = 8 + fields.reduce((n, f) => n + WIDTH[f.type], 0);

  const info = await connection.getAccountInfo(params);
  const have = info ? info.data.length : 0;
  console.log("params account:", params.toBase58());
  console.log("on chain      :", info ? `${have} bytes` : "missing");
  console.log("current layout:", `${needed} bytes`);

  if (info && have === needed) {
    const p = await program.account.params.fetch(params);
    console.log();
    console.log("live values");
    console.log("  slash_bps     ", p.slashBps);
    console.log("  reward_bps    ", p.rewardBps);
    console.log("  dispute_window", p.disputeWindow.toString());
    console.log("  commit_window ", p.commitWindow.toString());
    console.log("  reveal_window ", p.revealWindow.toString());
  }

  console.log();
  console.log("would write");
  console.log("  slash_bps     ", SLASH_BPS);
  console.log("  reward_bps    ", REWARD_BPS);
  console.log("  dispute_window", DISPUTE_WINDOW);
  console.log("  commit_window ", COMMIT_WINDOW);
  console.log("  reveal_window ", REVEAL_WINDOW);

  if (!APPLY) {
    console.log("\ndry run — pass --apply to write");
    return;
  }

  const args = [
    SLASH_BPS,
    new anchor.BN(DISPUTE_WINDOW),
    new anchor.BN(COMMIT_WINDOW),
    new anchor.BN(REVEAL_WINDOW),
    REWARD_BPS,
  ];

  if (!info) {
    const sig = await program.methods
      .initializeParams(...args)
      .accountsPartial({
        authority: payer.publicKey,
        pool,
        params,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("\ninitialized", sig);
    return;
  }

  if (have < needed) {
    const sig = await program.methods
      .migrateParams()
      .accountsPartial({
        authority: payer.publicKey,
        pool,
        params,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`\nresized ${have} -> ${needed} bytes`, sig);
  }

  const sig = await program.methods
    .setParams(...args)
    .accountsPartial({ authority: payer.publicKey, pool, params })
    .rpc();
  console.log("set", sig);
})().catch((e) => {
  console.error("params failed:", e.message || e);
  process.exit(1);
});
