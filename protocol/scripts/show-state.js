/**
 * Read the protocol's live state from devnet: pool counters, vault balance,
 * and every policy with its status.
 *
 *   RPC_URL=... node scripts/show-state.js
 */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection } = require("@solana/web3.js");
const { getAccount } = require("@solana/spl-token");

(async () => {
  const rpc = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(Keypair.generate()), // read-only
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/protocol.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );

  const p = await program.account.pool.fetch(pool);
  const v = await getAccount(connection, vault);

  console.log("pool");
  console.log("  authority :", p.authority.toBase58());
  console.log("  oracle    :", p.oracle.toBase58());
  console.log("  policies  :", p.policies.toString());
  console.log("  paid      :", p.claimsPaid.toString());
  console.log("  denied    :", p.claimsDenied.toString());
  console.log("  vault     :", (v.amount / 1_000_000_000n).toString(), "SURETY");
  console.log("  vault owner:", v.owner.toBase58(), v.owner.equals(pool) ? "(pool PDA ✓)" : "(!! not the pool)");
  console.log();

  const all = await program.account.policy.all();
  console.log(`policies (${all.length})`);
  for (const { publicKey, account: a } of all) {
    console.log(
      "  " +
        publicKey.toBase58().slice(0, 8) +
        "…  " +
        a.flight.padEnd(12) +
        String(a.payout).padStart(6) +
        "  " +
        Object.keys(a.status)[0].padEnd(10) +
        (a.basis ? " [" + a.basis + "]" : "")
    );
  }
})().catch((e) => {
  console.error("failed:", e.message || e);
  process.exit(1);
});
