# SURETY Devnet Faucet — runbook

A serverless endpoint that sends **SURETY devnet tokens** to anyone who enters
their wallet on the testnet page. crypsurance.io is a static site and can't hold
a signing key, so this **Cloudflare Worker** holds the pool key as a secret,
rate-limits requests, and does the on-chain transfer.

## What's deployed
| | |
|---|---|
| Worker name | `crypsurance-faucet` |
| Live URL | `https://crypsurance-faucet.surety.workers.dev` |
| Frontend | `components/Faucet.tsx` → `FAUCET_ENDPOINT` (devnet page `/devnet`) |
| Sender (pool) wallet | `9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy` |
| SURETY mint | `8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9` |
| Rate-limit store | KV `FAUCET_KV` (`e3a76037b6364bc98aa0752680c538a6`) |
| Amount / cooldown | `2500` SURETY · `8h` per wallet · `4` per network (`[vars]` in `wrangler.toml`) |

Secrets live **only on the Worker** (never in this repo): `DEVNET_KEYPAIR`, `RPC_URL`.

---

## First-time deploy (recorded for the future)

Run everything from this `faucet-worker/` folder:

```bash
# 0. install deps (once)
npm install

# 1. log in (opens Cloudflare in the browser; free account)
npx wrangler login

# 2. create the rate-limit store, then paste the printed id into
#    wrangler.toml -> [[kv_namespaces]].id
npx wrangler kv namespace create FAUCET_KV

# 3. add the two secrets
npx wrangler secret put DEVNET_KEYPAIR   # answer "Y" to create the worker on the
                                         # first secret; paste the byte array from
                                         # solana/devnet-test.json (one line)
npx wrangler secret put RPC_URL          # paste the Helius devnet URL (solana/.env)

# 4. deploy, then copy the printed https://crypsurance-faucet.<subdomain>.workers.dev
npx wrangler deploy
```

Then set that URL as `FAUCET_ENDPOINT` in `components/Faucet.tsx`, commit and
push — the site auto-deploys and the faucet goes live.

> ⚠️ **Gotcha we hit:** a stray character pasted into the `RPC_URL` secret made
> the Worker throw a blank Cloudflare **1101**. The Worker now scrubs secrets and
> returns real JSON errors, but paste secret values cleanly (no surrounding
> quotes/spaces).

## Change settings or code (redeploy)
```bash
# amount / cooldown -> edit [vars] in wrangler.toml, then:
npx wrangler deploy
# logic -> edit src/index.js, then:
npx wrangler deploy
# rotate a secret:
npx wrangler secret put DEVNET_KEYPAIR      # or RPC_URL
```

**If the Worker URL changes** (renamed worker, or new account subdomain):
update `FAUCET_ENDPOINT` in `components/Faucet.tsx` (and `name = "…"` in
`wrangler.toml` only if the *worker name* changed), then commit + push.

---

## Keeping it running — check balance & refill

The pool wallet **sends SURETY** and **pays ~0.002 SOL rent** for each brand-new
recipient. SURETY is effectively unlimited (~1B supply); **SOL is the one that
runs out** — watch it.

**Check status** (from the `solana/` folder):
```bash
node faucet-status.js
```
```
Pool wallet:  9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy
  SOL:    0.4067  (~199 new-wallet drips before more SOL is needed)
  SURETY: 998,987,980  (~399,595 drips of 2,500)
  ✓ Healthy.
```

Prefer the Solana CLI? Equivalent one-liners:
```bash
solana balance 9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy --url devnet
spl-token balance 8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9 \
  --owner 9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy --url devnet
```

### The faucet also sends SOL

Since M3 week 2 the faucet drips ~0.02 devnet SOL alongside the tokens, but only
when the recipient's balance is below that. A wallet holding SURETY and no SOL
cannot transact at all — fees and the Policy account's rent both need it — and
sending testers to an external faucet first lost some of them.

Override with the `FAUCET_SOL` var (0 disables it). This spends the faucet
wallet's own SOL, so watch its balance more closely than before:

```bash
cd solana && node faucet-status.js
```

**Refill SOL** (do this when `faucet-status` warns, i.e. below ~0.05 SOL):
- Easiest: paste the pool address `9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy`
  into <https://faucet.quicknode.com/solana/devnet>.
- Or with the Solana CLI (rate-limited):
  ```bash
  solana airdrop 2 9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy --url devnet
  ```

**Refill SURETY** — rarely needed (the pool holds the whole supply). If it ever
runs low, send more from any wallet that holds SURETY with
`solana/send-surety.js`.

---

## Test the live faucet
```bash
curl -X POST https://crypsurance-faucet.surety.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"address":"<your devnet wallet>"}'
# -> {"signature":"...","amount":2500,"confirmed":true}
```

## Oracle trigger (Cloudflare cron → GitHub)

The claims oracle does **not** run in this Worker. It needs
`getProgramAccounts` to list pending policies, and no endpoint serves that from
Cloudflare's IP ranges — Helius doesn't offer it, and Solana's public RPC
returns `403 Your IP or provider is blocked`. A GitHub runner can, so the
oracle lives in [`protocol/scripts/oracle.js`](../protocol/scripts/oracle.js).

GitHub's own `schedule` is best-effort: measured over 12 runs it was **16.5
minutes late on average**, with real gaps between runs of 64–224 minutes.
Cloudflare's cron fires within seconds of the boundary. So the Worker supplies
the timing and GitHub supplies the network access — the cron here calls
`workflow_dispatch`, which isn't queued behind the same backlog.

Setup (one time):

1. Create a **fine-grained personal access token** at
   <https://github.com/settings/personal-access-tokens/new>
   - Repository access: only `rjsalaria/crypsurance`
   - Permissions → Repository → **Actions: Read and write**
2. Store it and deploy:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```
3. Verify without waiting for the cron:
   ```bash
   curl https://crypsurance-faucet.surety.workers.dev/dispatch-oracle
   ```
   A run should appear immediately under the repo's Actions tab.

The workflow keeps its own `schedule:` as a backstop if the Worker or the token
ever fails. Double runs are harmless — the oracle only settles policies still
in `requested`, and the workflow's concurrency group serialises them.

## ⚠️ Never run `npm audit fix --force` here

It "fixes" advisories by downgrading, and for this dependency set it rewrites
`package.json` to `@solana/web3.js@^0.0.3` and `@solana/spl-token@^0.1.8` —
a 2017 placeholder package and an ancient release. The deploy then fails with
confusing errors like:

```
No matching export in "@solana/spl-token/lib/index.browser.esm.js"
  for import "getAssociatedTokenAddress"
Import "Connection" will always be undefined because
  "@solana/web3.js/lib/index.iife.js" has no exports
```

That is not a bundler or Wrangler problem — it means the wrong packages are
installed. Recover with:

```bash
git checkout HEAD -- package.json
rm -rf node_modules package-lock.json
npm install
```

Plain `npm audit` is fine; it is only `--force` that downgrades.

## Security
Devnet only — play money; never put a mainnet key here. The signing key is a
Cloudflare **secret**, not in the repo. `.gitignore` keeps `node_modules/`,
`dist/`, `.wrangler/`, and `.dev.vars` out of git.
