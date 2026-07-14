# SURETY Token — Launch Runbook

Every command used (and to be used) for creating and launching the SURETY token
on Solana, with what it does and what to expect. Commands are PowerShell-ready
for Windows unless noted.

**Status:** devnet rehearsal completed —
mint [`8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9`](https://explorer.solana.com/address/8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9?cluster=devnet)
(1B SURETY, mint + freeze authority revoked). Earlier rehearsal mints under
the retired SURE and SURT symbols (`baane…sQNZ`, `3fud…scLV`) are abandoned.

---

## 0. One-time setup

```powershell
cd D:\Workplace\Crypsurance\solana
npm install
```

Installs the dependencies (`package.json`):

| Package | Why |
|---|---|
| `@solana/web3.js` | Core Solana library — connections, keypairs, balances |
| `@solana/spl-token` | Official token library — mints supply, revokes authorities |
| `@metaplex-foundation/*` (umi, mpl-token-metadata) | Creates the mint **with metadata** (name/symbol/logo) — the standard wallets read |
| `bs58`, `dotenv` | Key decoding + reading `.env` |

Then copy the env template and fill it in (see each stage for which values):

```powershell
copy .env.example .env
```

`.env` is gitignored. **Never commit it, never share its contents.**

---

## 1. Create a keypair (test wallets only)

```powershell
node -e "const {Keypair} = require('@solana/web3.js'); const fs = require('fs'); const kp = Keypair.generate(); fs.writeFileSync('devnet-test.json', JSON.stringify(Array.from(kp.secretKey))); console.log('pubkey:', kp.publicKey.toBase58())"
```

Generates a throwaway wallet and saves its secret key to `devnet-test.json`
(gitignored). Prints the public address — that's the shareable half.

> For **mainnet**, don't generate keys this way. Use Phantom (create wallet →
> back up the seed phrase on paper) and export the private key into `.env`
> as `PRIVATE_KEY=` instead.

Our devnet test wallet: `9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy`

---

## 2. Check a wallet balance

```powershell
node -e "const {Connection, PublicKey, LAMPORTS_PER_SOL} = require('@solana/web3.js'); (async () => { const c = new Connection('https://api.devnet.solana.com'); console.log((await c.getBalance(new PublicKey('WALLET_ADDRESS_HERE'))) / LAMPORTS_PER_SOL, 'SOL'); process.exit(0) })()"
```

Replace `WALLET_ADDRESS_HERE`. Works for any wallet — balances are public.

---

## 3. Get devnet SOL (practice money)

Token creation costs ~0.02 SOL. What we learned the hard way:

| Source | Verdict |
|---|---|
| `requestAirdrop` on the public RPC | Usually **429 rate-limited** (shared quota) |
| faucet.solana.com | Requires GitHub with public-repo history |
| Helius devnet faucet | Works but **1 SOL per project per day** — request exactly 1 |
| **faucet.quicknode.com/solana/devnet** | ✅ What worked: connect Phantom (devnet mode), no GitHub needed |

The route that worked: Phantom → Settings → Developer Settings → Testnet mode
→ QuickNode faucet → send SOL onward to the test wallet from Phantom.

Programmatic attempt (fine to try first, exact CLI equivalent of
`solana airdrop`):

```powershell
node -e "const {Connection, PublicKey, LAMPORTS_PER_SOL} = require('@solana/web3.js'); (async () => { const c = new Connection('https://api.devnet.solana.com'); console.log(await c.requestAirdrop(new PublicKey('WALLET_ADDRESS_HERE'), 1 * LAMPORTS_PER_SOL)); process.exit(0) })()"
```

---

## 4. Create the token — THE command

### Devnet (rehearsal — done ✓)

```powershell
cd D:\Workplace\Crypsurance\solana
$env:KEYPAIR_PATH = "D:\Workplace\Crypsurance\solana\devnet-test.json"
$env:RPC_URL = "https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY"
node create-token.js devnet
```

### Mainnet (the real launch)

Fill `.env` first: `PRIVATE_KEY` (from Phantom), `RPC_URL`
(Helius **mainnet** URL), `METADATA_URI` (must be live — see step 6). Fund the
wallet with ~0.2 SOL. Then:

```powershell
node create-token.js mainnet-beta
```

**What the script does, in order** (`create-token.js`):

1. **Creates the mint + metadata** — the token's on-chain identity: name
   "CrypSurance", symbol "SURETY", 9 decimals, link to the logo file.
2. **Mints 1,000,000,000 SURETY** to your wallet — the only mint that will
   ever happen.
3. **Revokes the mint authority** — destroys the power to create more
   tokens. Irreversible, and the #1 thing buyers verify.
4. **Revokes the freeze authority** — destroys the power to freeze anyone's
   tokens. Scanners check this too.

It prints a summary and an explorer link at the end. Expect
`Mint authority: none (revoked ✓)` and `Freeze authority: none ✓`.

> Harmless warnings you'll see: `bigint: Failed to load bindings` (a speed
> optimization falling back to JavaScript) and on Windows sometimes an
> `Assertion failed … async.c` line *after* the output — both cosmetic.

---

## 5. Verify the token on-chain

```powershell
node -e "(async () => { const r = await fetch('https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: 'MINT_ADDRESS_HERE' } }) }); const j = await r.json(); console.log(j.result?.content?.metadata); process.exit(0) })()"
```

Asks Helius's token API for the name/symbol exactly as wallets will read
them. Or just open the explorer link the script prints and eyeball:
supply 1B, both authorities `none`.

---

## 6. Send SURETY to any wallet (the airdrop tool)

```powershell
cd D:\Workplace\Crypsurance\solana
$env:KEYPAIR_PATH = "D:\Workplace\Crypsurance\solana\devnet-test.json"
$env:RPC_URL = "https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY"
node send-surety.js RECIPIENT_ADDRESS AMOUNT
```

Sends SURETY from the holding wallet (which received the full 1B at
creation) to any address — e.g. `node send-surety.js 3Ebt…YkjB 100000`.
Creates the recipient's token account automatically if they've never held
SURETY (costs the sender ~0.002 SOL rent). This is the tool for
testnet-community starter airdrops.

Notes:
- The recipient needs only a public **address** — never ask anyone for
  keys or seed phrases, and never share yours.
- Tokens show in Phantom only with Testnet Mode on (devnet), and with a
  grey icon until the metadata JSON is hosted on crypsurance.io.
- Devnet holdings as of 2026-07-14: holding wallet 999M, founder Phantom
  (`3Ebt…YkjB`) 1M.

---

## 7. Before mainnet: the checklist

1. **Metadata live** — `https://crypsurance.io/surety-metadata.json` and the
   square logo PNG must return 200 (they ship with the site zip).
2. **Squads multisig created** (squads.so) — the treasury vault.
3. **Helius mainnet RPC** in `.env` — the public RPC is not reliable enough
   for a launch.
4. **Immediately after minting:** send the full 1B SURETY from the deployer
   wallet to the multisig (Phantom → Send → paste multisig address, or ask
   for a transfer script). The deployer wallet is then retired.
5. **Publish the mint address** on the website, X and Telegram — pinned.
   This is the anti-scam measure.

After that: Streamflow vesting locks → PinkSale presale → finalize →
Raydium listing. Full detail in the launch playbook artifact.

---

## Security rules (worth repeating)

- `.env`, `*.json` keypairs: **never committed** (gitignored), never shared,
  never pasted into websites or chats.
- The Helius **API key** is low-risk (it's a service subscription, not a
  wallet) — but regenerate it if it leaks, since others could burn your quota.
- Mainnet deploys: fresh wallet, minimum funds, supply moved to the multisig
  in the same sitting.
