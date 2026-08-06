/**
 * Run the Worker's oracle locally, so its logic can be exercised without
 * deploying. Same module the Cron Trigger calls — this only supplies the env
 * the Worker runtime would normally inject.
 *
 *   RPC_URL=... DEVNET_KEYPAIR="$(cat keypair.json)" node scripts/run-local.mjs
 */
import { runOracle } from "../src/oracle.js";

const env = {
  RPC_URL: process.env.RPC_URL,
  DEVNET_KEYPAIR: process.env.DEVNET_KEYPAIR,
  AVIATIONSTACK_KEY: process.env.AVIATIONSTACK_KEY,
  // no FAUCET_KV locally — the heartbeat write is skipped
};

const log = await runOracle(env);
for (const line of log) console.log(" ", line);
