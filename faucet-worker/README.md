# SURETY Devnet Faucet (Cloudflare Worker)

A tiny serverless endpoint that sends **SURETY devnet tokens** to anyone who
enters their wallet address on the testnet page. The pool wallet's private key
lives **only here** (as a Cloudflare secret) — never in the website.

## Why a Worker?
crypsurance.io is a static site, so it can't hold the signing key. This Worker
holds it securely, rate-limits requests, and does the actual on-chain transfer.

## One-time setup

From this `faucet-worker/` folder:

```bash
npm install
npx wrangler login                      # opens Cloudflare in your browser (free account)

# 1. Create the rate-limit store, then paste the printed id into wrangler.toml
npx wrangler kv namespace create FAUCET_KV

# 2. Add the two secrets
npx wrangler secret put DEVNET_KEYPAIR  # paste the byte array from solana/devnet-test.json
npx wrangler secret put RPC_URL         # your Helius devnet RPC URL

# 3. Deploy
npx wrangler deploy
```

`wrangler deploy` prints a URL like:

```
https://crypsurance-faucet.<your-subdomain>.workers.dev
```

Put that URL into **`components/Faucet.tsx`** (the `FAUCET_ENDPOINT` constant),
commit, and push — the site auto-deploys and the faucet goes live.

## Requirements
- The **pool wallet** (`9txX…Bkxy`, the DEVNET_KEYPAIR) must hold SURETY and a
  little devnet **SOL** — it pays the ~0.002 SOL account-rent + fees for each
  new recipient. Top it up at faucet.quicknode.com/solana/devnet if it runs low.

## Settings (`wrangler.toml` → `[vars]`)
| Var | Default | Meaning |
|-----|---------|---------|
| `FAUCET_AMOUNT` | `2500` | SURETY sent per request |
| `COOLDOWN_HOURS` | `8` | per-wallet cooldown |
| `IP_DAILY_LIMIT` | `4` | max requests per network per window |

Change a var and re-run `npx wrangler deploy`.

## Test it
```bash
curl -X POST https://crypsurance-faucet.<you>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"address":"<your devnet wallet>"}'
# -> {"signature":"...","amount":2500,"confirmed":true}
```

## Security notes
- Devnet only — play money. Never put a mainnet key here.
- The key is a Cloudflare **secret**, not in the repo. `.gitignore` keeps
  `node_modules`, `.dev.vars`, and `.wrangler` out of git.
