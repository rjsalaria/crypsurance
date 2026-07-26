/**
 * Faucet health check — how much the SURETY faucet has left to give.
 *
 * Prints the pool wallet's SOL and SURETY balances and estimates how many
 * more faucet drips it can serve before each runs out.
 *
 *   node faucet-status.js
 *
 * Uses RPC_URL from solana/.env (falls back to public devnet).
 */

require("dotenv").config();
const {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

// Must match the faucet Worker (faucet-worker/).
const POOL = new PublicKey("9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy");
const MINT = new PublicKey("8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9");
const DRIP = 2500; // FAUCET_AMOUNT (SURETY sent per request)
const RENT_PER_NEW_WALLET = 0.00204; // ~SOL to create a new recipient token account

const RPC = (process.env.RPC_URL || "https://api.devnet.solana.com").trim();

(async () => {
  const conn = new Connection(RPC, "confirmed");

  const sol = (await conn.getBalance(POOL)) / LAMPORTS_PER_SOL;
  const accts = await conn.getParsedTokenAccountsByOwner(POOL, { mint: MINT });
  const surety = accts.value.reduce(
    (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0
  );

  const dripsBySurety = Math.floor(surety / DRIP);
  const dripsBySol = Math.floor(sol / RENT_PER_NEW_WALLET);

  console.log(`Pool wallet:  ${POOL.toBase58()}`);
  console.log(
    `  SOL:    ${sol.toFixed(4)}  (~${dripsBySol.toLocaleString()} new-wallet drips before more SOL is needed)`
  );
  console.log(
    `  SURETY: ${surety.toLocaleString()}  (~${dripsBySurety.toLocaleString()} drips of ${DRIP.toLocaleString()})`
  );

  if (sol < 0.05) {
    console.log(
      "\n⚠ LOW ON SOL — refill: paste the pool address into"
    );
    console.log("   https://faucet.quicknode.com/solana/devnet");
    console.log("   or: solana airdrop 2 " + POOL.toBase58() + " --url devnet");
  } else {
    console.log("\n✓ Healthy.");
  }
})().catch((e) => {
  console.error("Could not read balances:", e.message);
  process.exit(1);
});
