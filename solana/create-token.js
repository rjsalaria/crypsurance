/**
 * Create the SURE token on Solana (devnet or mainnet-beta).
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
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const {
  keypairIdentity,
  generateSigner,
  percentAmount,
  none,
} = require("@metaplex-foundation/umi");
const {
  mplTokenMetadata,
  createFungible,
  mintV1,
  TokenStandard,
} = require("@metaplex-foundation/mpl-token-metadata");
const {
  mplToolbox,
  setAuthority,
  AuthorityType,
  findAssociatedTokenPda,
} = require("@metaplex-foundation/mpl-toolbox");

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
  process.env.METADATA_URI || "https://crypsurance.io/sure-metadata.json";

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
  const umi = createUmi(RPC).use(mplTokenMetadata()).use(mplToolbox());
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecretKey());
  umi.use(keypairIdentity(kp));

  console.log(`Cluster: ${CLUSTER} (${RPC})`);
  console.log(`Wallet:  ${kp.publicKey}`);

  const mint = generateSigner(umi);
  console.log(`Mint:    ${mint.publicKey}`);

  // 1. create mint + metadata
  console.log("\n[1/3] Creating mint + metadata…");
  await createFungible(umi, {
    mint,
    name: "CrypSurance",
    symbol: "SURE",
    uri: METADATA_URI,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: 9,
  }).sendAndConfirm(umi);

  // 2. mint full fixed supply to our wallet
  console.log("[2/3] Minting 1,000,000,000 SURE…");
  await mintV1(umi, {
    mint: mint.publicKey,
    amount: SUPPLY,
    tokenOwner: umi.identity.publicKey,
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi);

  // 3. revoke mint authority => supply is fixed forever
  //    (freeze authority is already None for createFungible mints)
  console.log("[3/3] Revoking mint authority (fixed supply)…");
  await setAuthority(umi, {
    owned: mint.publicKey,
    owner: umi.identity,
    authorityType: AuthorityType.MintTokens,
    newAuthority: none(),
  }).sendAndConfirm(umi);

  const ata = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: umi.identity.publicKey,
  });

  console.log("\n=== SURE token created ===");
  console.log(`Mint address:   ${mint.publicKey}`);
  console.log(`Token account:  ${ata[0]}`);
  console.log(`Supply:         1,000,000,000 SURE (fixed — mint authority revoked)`);
  console.log(
    `Explorer:       https://explorer.solana.com/address/${mint.publicKey}?cluster=${CLUSTER === "mainnet-beta" ? "mainnet" : CLUSTER}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
