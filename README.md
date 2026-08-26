# CrypSurance

Parametric cover on Solana, where claims are settled by program logic instead
of a claims department.

Buy cover, file a claim, and an autonomous oracle checks the real-world event
and settles it on-chain. Premiums sit in a vault owned by a program-derived
address — **no private key can move them, ours included** — and there is
deliberately no withdraw instruction. An approved claim always pays the
policy's own holder.

Running on Solana **devnet**. Play money, real mechanics: everything below is a
live account you can inspect yourself.

- **Live:** [crypsurance.io/devnet](https://crypsurance.io/devnet) — take free
  test tokens from the faucet and run the whole loop
- **Verifier network:** [network.crypsurance.io](https://network.crypsurance.io)
- **Licence:** MIT

## Verify it rather than trust it

| | |
|---|---|
| Program | [`4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr`](https://explorer.solana.com/address/4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr?cluster=devnet) |
| Pool (PDA) | `3dXoTrVcc3KTYWo5zP1p5HW5yPvnGuyoCWQMe51K5c4R` |
| Vault (PDA, holds premiums) | `AZUkEwuRhD3u2X3jX27UdDY8HNZcPFRuvje3QErMGpZE` |
| SURETY mint | `8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9` |
| Upgrade authority | `7SEo9AVxa7gHYHvDXq9a2Zpj5MgDWK1eX5XhH6mUuxBD` |
| Oracle | `9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy` |

```bash
cd solana && node protocol-stats.js   # policies, claims, payouts — read from chain
```

## How a claim works

```
holder                     program                        oracle
  │                                                          │
  ├─ buy_cover ──────────▶ Policy account created            │
  │                        premium → vault (PDA-owned)       │
  │                        premium computed on-chain         │
  │                                                          │
  ├─ file_claim ─────────▶ status: requested ───────────────▶│
  │                                                          ├─ checks flight data
  │                        ◀───────────── settle_claim ──────┤
  │◀── payout from vault   status: paid / denied             │
                           (or escalated → human verifiers)
```

The oracle decides **whether** a claim is valid. It cannot decide **who gets
paid**: the program constrains the destination to the policy's holder, so a
compromised oracle key can approve a wrong claim but cannot redirect a payout.
There is a test for exactly that.

Because the upgrade authority is a separate offline key — not the oracle's —
leaking the oracle secret also can't be escalated into replacing the program.

## Repo layout

| Path | What it is |
|---|---|
| `protocol/` | The Anchor program, its tests, and deploy/oracle scripts |
| `app/`, `components/` | Next.js site and dApp (static export) |
| `faucet-worker/` | Cloudflare Worker: SURETY faucet, RPC proxy, oracle trigger |
| `solana/` | Token tooling and on-chain stats |
| `.github/workflows/` | Site deploy, and the oracle that settles claims |
| `grants/`, `marketing/` | Written material, not code |

## Development

```bash
npm install
npm run dev            # site at http://localhost:3000
npm test               # client wire-format tests (no network, no toolchain)
npm run lint
npm run build          # static export into out/
npx serve out -l 5050  # preview exactly what gets deployed
```

`npm test` checks the browser client's hand-rolled Anchor encoding against the
way Anchor derives it — discriminators, the Borsh layout, the account offsets,
the PDAs. That code path otherwise runs only in a browser with a wallet
attached, which is the awkward place to find out it's wrong.

The Anchor program needs Rust, the Solana CLI and Anchor (on Windows, inside
WSL):

```bash
cd protocol
anchor build
anchor test --provider.cluster localnet   # 32 tests on a throwaway validator
```

`--provider.cluster localnet` matters: `Anchor.toml` points at devnet so that
deploys go to the right place, and without the flag the tests would run against
the live deployment.

Both suites, plus lint and the static build, run in CI on every push and pull
request — see [.github/workflows/ci.yml](.github/workflows/ci.yml). CI also
fails if `protocol/idl/protocol.json` drifts from what `anchor build` produces,
because that file is what the site and the oracle read.

Useful scripts, all reading live devnet:

```bash
cd protocol
node scripts/show-state.js     # pool counters, vault balance, every policy
node scripts/oracle.js --dry-run   # what the oracle would settle
node scripts/demo-claim.js     # buy cover + file a claim end to end
node scripts/params.js         # show the live slashing / reward parameters
```

## Deployment

Push to `main`. A GitHub Action builds the site and pushes it to the
`hostinger-deploy` branch, which Hostinger pulls into the docroot; the workflow
then fetches the live page and only goes green if it is actually serving the
new build. The Worker deploys separately with `npx wrangler deploy` — see
[faucet-worker/README.md](faucet-worker/README.md).

## What is and isn't true yet

Stated plainly, because the interesting part of an insurance protocol is what
it *can't* do to you:

- **Devnet only.** SURETY here is play money with no value and no path to a
  mainnet asset. Nothing regulated is being sold.
- **Consensus is real; the operators are still ours.** A verdict now needs
  M-of-N staked operators, sealed by commit-reveal so none of them can see how
  the others voted before committing, and an operator that ends up contradicting
  the settled outcome loses a slice of its stake. All three keys are still run
  by us on one machine, so this proves the *mechanism*, not yet the
  independence. Separate infrastructure is the next milestone.
- **Operators are paid, in play money.** A correct verdict earns a share of the
  premium the holder already paid. It is a real incentive in a fake currency;
  read it as a working design, not a yield.
- **The upgrade authority is a keypair, not a multisig.** Whoever holds it can
  replace the program. Fine for a devnet testbed; a multisig is required before
  anything resembling mainnet, and the intended end state is that operators
  govern upgrades by stake.
- **Not audited.**
- **Payouts are parametric.** A claim pays when the data says the trigger was
  met — currently a flight delayed 3+ hours — not when someone judges a loss.

We use "cover" rather than "insurance" for anything offered, deliberately: no
licensed insurance product exists here.
