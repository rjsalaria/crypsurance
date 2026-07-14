/**
 * Send SURETY (devnet) from the holding wallet to any address.
 *
 * Usage:
 *   node send-surety.js <RECIPIENT_ADDRESS> <AMOUNT>
 *   e.g. node send-surety.js 7xKX...gAsU 10000
 *
 * Sender = wallet from KEYPAIR_PATH or PRIVATE_KEY in .env
 * (the devnet rehearsal wallet holds the full 1B supply).
 * Also creates the recipient's SURETY token account if missing
 * (sender pays the ~0.002 SOL rent).
 */

require("dotenv").config();
const fs = require("fs");
const bs58 = require("bs58");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  transfer,
} = require("@solana/spl-token");

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const DECIMALS = 9n;

const [, , recipientArg, amountArg] = process.argv;
if (!recipientArg || !amountArg) {
  console.error("Usage: node send-surety.js <RECIPIENT_ADDRESS> <AMOUNT>");
  process.exit(1);
}

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";

function loadSecretKey() {
  if (process.env.KEYPAIR_PATH) {
    return Uint8Array.from(
      JSON.parse(fs.readFileSync(process.env.KEYPAIR_PATH, "utf8"))
    );
  }
  if (process.env.PRIVATE_KEY) {
    return bs58.decode(process.env.PRIVATE_KEY);
  }
  throw new Error("Set KEYPAIR_PATH or PRIVATE_KEY in solana/.env");
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const sender = Keypair.fromSecretKey(loadSecretKey());
  const recipient = new PublicKey(recipientArg);
  const amount = BigInt(Math.round(Number(amountArg))) * 10n ** DECIMALS;

  console.log(`Sender:    ${sender.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipient.toBase58()}`);
  console.log(`Amount:    ${Number(amountArg).toLocaleString()} SURETY`);

  const senderAta = await getOrCreateAssociatedTokenAccount(
    conn, sender, SURETY_MINT, sender.publicKey
  );
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    conn, sender, SURETY_MINT, recipient
  );

  const sig = await transfer(
    conn, sender, senderAta.address, recipientAta.address, sender, amount
  );

  console.log(`\nSent ✓  ${sig}`);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
