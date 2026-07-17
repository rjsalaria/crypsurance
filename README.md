# CrypSurance

Decentralized insurance protocol — marketing site, interactive demo, SURETY
token tooling, and whitepaper. Live at [crypsurance.io](https://crypsurance.io).

## What's in this repo

| Path | What it is |
|---|---|
| `app/` | Next.js site — home, `/learn` (how it works), `/app` (guided insurance demo) |
| `components/` | React components, incl. `DemoJourney` (5-step buy-a-policy walkthrough) |
| `public/` | Static assets: logo, `whitepaper.pdf` |
| `scripts/generate_whitepaper.py` | Regenerates the whitepaper PDF (Python + reportlab) |
| `solana/` | SURETY token creation tooling — **see [solana/README.md](solana/README.md) for the full launch runbook** |

## Everyday commands

```powershell
# run the site locally with hot reload (http://localhost:3000)
npm run dev

# production build → static site in out/
npm run build

# preview the exact static build Hostinger will serve (http://localhost:5050)
npx serve out -l 5050

# package for Hostinger (upload zip → extract into public_html root)
Compress-Archive -Path out\* -DestinationPath crypsurance-site.zip -Force

# regenerate the whitepaper after editing the script
python scripts/generate_whitepaper.py   # then npm run build to include it
```

## Deploying to Hostinger

1. `npm run build`, zip `out\*` (commands above)
2. hPanel → File Manager → upload zip into `public_html` → Extract
3. Critical: `_next/`, `learn/`, `app/`, `index.html` must sit **directly in
   `public_html`** — not inside a subfolder
4. Hard-refresh crypsurance.io (Ctrl+F5)

## Verifier Network subdomain (network.crypsurance.io)

The Verifier Network portal lives at `/verify` in this same build. To serve
it on the dedicated subdomain from Hostinger:

1. hPanel → Domains → Subdomains → create `network.crypsurance.io`
2. Easiest v1: set the subdomain to **redirect** to `https://crypsurance.io/verify/`
3. Later (own document root): upload the same site zip into the subdomain's
   folder — the build is root-relative, so `/verify/` works there too

The claims oracle operator (`solana/process-claims.js`) escalates unverifiable
claims to the network as on-chain `verify-request` memos; resolve them after
offline/partner verification with:

```powershell
node process-claims.js --resolve POLICY_ID --delayed yes --basis partner:NAME        # dry run
node process-claims.js --resolve POLICY_ID --delayed yes --basis partner:NAME --pay  # executes
```

## Token launch

The SURETY token launches on Solana (PinkSale presale → Raydium listing).
Start with the runbook in [solana/README.md](solana/README.md); tokenomics
and terms live in the whitepaper.

Devnet rehearsal (2026-07-12):
mint [`8wAq…sHn9`](https://explorer.solana.com/address/8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9?cluster=devnet)
— 1B SURETY, mint + freeze authorities revoked. ✓
