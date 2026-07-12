/**
 * Create the SURETY token on Solana (devnet or mainnet-beta).
 *
 * - Classic SPL token + Metaplex metadata (maximum wallet/DEX compatibility)
 * - 1,000,000,000 supply, 9 decimals, minted to your wallet
 * - Mint + freeze authority revoked afterwards => fixed supply, no owner powers
 *
 * Usage:
 *   node create-token.js devnet            (dry-run on devnet, throwaway key ok)
 *   node create-token.js mainnet-beta      (the real thing — use your own RPC)
 *
 * Reads KEYPAIR_PATH (a solana-keygen JSON file) or PRIVATE_KEY (base58)
 * from .env — see .env.example. NEVER share or commit these.
 */

require("dotenv").config();
const fs = require("fs");
const bs58 = require("bs58");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
  getMint,
} = require("@solana/spl-token");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { keypairIdentity, generateSigner, percentAmount } = require("@metaplex-foundation/umi");
const {
  mplTokenMetadata,
  createFungible,
} = require("@metaplex-foundation/mpl-token-metadata");

const CLUSTER = process.argv[2] || "devnet";
const RPC =
  process.env.RPC_URL ||
  (CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : `https://api.${CLUSTER}.solana.com`);

const SUPPLY = 1_000_000_000n * 10n ** 9n; // 1B with 9 decimals

// Hosted token metadata JSON: { name, symbol, description, image }
// Point this at your real hosted file before mainnet.
const METADATA_URI =
  process.env.METADATA_URI || "https://crypsurance.io/surety-metadata.json";

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
  const secret = loadSecretKey();

  // umi handles mint + metadata creation (Metaplex standard)
  const umi = createUmi(RPC).use(mplTokenMetadata());
  const umiKp = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(umiKp));

  // web3.js + spl-token handle supply mint and authority revocation
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(secret);

  console.log(`Cluster: ${CLUSTER}`);
  console.log(`Wallet:  ${payer.publicKey.toBase58()}`);

  const mint = generateSigner(umi);
  const mintPk = new PublicKey(mint.publicKey);
  console.log(`Mint:    ${mintPk.toBase58()}`);

  // 1. create mint + metadata
  console.log("\n[1/4] Creating mint + metadata…");
  await createFungible(umi, {
    mint,
    name: "CrypSurance",
    symbol: "SURETY",
    uri: METADATA_URI,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: 9,
  }).sendAndConfirm(umi);

  // 2. mint full fixed supply to our wallet
  console.log("[2/4] Minting 1,000,000,000 SURETY…");
  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mintPk,
    payer.publicKey
  );
  await mintTo(conn, payer, mintPk, ata.address, payer, SUPPLY);

  // 3. revoke mint authority => supply is fixed forever
  console.log("[3/4] Revoking mint authority (fixed supply)…");
  await setAuthority(
    conn,
    payer,
    mintPk,
    payer,
    AuthorityType.MintTokens,
    null
  );

  // 4. revoke freeze authority if present => no one can freeze holders
  const info = await getMint(conn, mintPk);
  if (info.freezeAuthority) {
    console.log("[4/4] Revoking freeze authority…");
    await setAuthority(
      conn,
      payer,
      mintPk,
      payer,
      AuthorityType.FreezeAccount,
      null
    );
  } else {
    console.log("[4/4] Freeze authority already none ✓");
  }

  const finalInfo = await getMint(conn, mintPk);
  console.log("\n=== SURETY token created ===");
  console.log(`Mint address:     ${mintPk.toBase58()}`);
  console.log(`Token account:    ${ata.address.toBase58()}`);
  console.log(`Supply:           ${(finalInfo.supply / 10n ** 9n).toLocaleString()} SURETY`);
  console.log(`Mint authority:   ${finalInfo.mintAuthority ?? "none (revoked ✓)"}`);
  console.log(`Freeze authority: ${finalInfo.freezeAuthority ?? "none ✓"}`);
  console.log(
    `Explorer:         https://explorer.solana.com/address/${mintPk.toBase58()}?cluster=${CLUSTER === "mainnet-beta" ? "mainnet" : CLUSTER}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
