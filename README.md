# CrypSurance

Decentralized insurance protocol — marketing site, interactive demo, SURE
token tooling, and whitepaper. Live at [crypsurance.io](https://crypsurance.io).

## What's in this repo

| Path | What it is |
|---|---|
| `app/` | Next.js site — home, `/learn` (how it works), `/app` (guided insurance demo) |
| `components/` | React components, incl. `DemoJourney` (5-step buy-a-policy walkthrough) |
| `public/` | Static assets: logo, `whitepaper.pdf` |
| `scripts/generate_whitepaper.py` | Regenerates the whitepaper PDF (Python + reportlab) |
| `solana/` | SURE token creation tooling — **see [solana/README.md](solana/README.md) for the full launch runbook** |

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

## Token launch

The SURE token launches on Solana (PinkSale presale → Raydium listing).
Start with the runbook in [solana/README.md](solana/README.md); tokenomics
and terms live in the whitepaper.

Devnet rehearsal (2026-07-06):
mint [`baane…sQNZ`](https://explorer.solana.com/address/baanezF9eVdi7nXnCs3zjE31MQhBUwhj6cmn86LsQNZ?cluster=devnet)
— 1B SURE, mint + freeze authorities revoked. ✓
