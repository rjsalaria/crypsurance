# Grant application — CrypSurance

**Target:** [Solana Foundation India Grants](https://superteam.fun/earn/grants/solana-foundation-india-grants/)
— **OPEN** (verified 2026-08-01) · India-only · up to **10,000 USDC** · avg grant
$4,667 · 117 recipients / $546k paid · ~30-day response · equity-free ·
run by Superteam India (contact: [@paarugsethi](https://x.com/paarugsethi))

**Ask:** 10,000 USDC · **Status:** draft, ready to submit

> ⚠️ The *CoinDCX* India grant (up to 15k) is **CLOSED** — its Apply button is
> disabled. Search results and cached listings still show it as live; don't
> waste time there.
>
> **Fallback / parallel option:** the Solana Foundation's own grant program is
> rolling, always open, and has **no regional restriction** —
> application form: <https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw>
> (~1 week initial review, ~3 weeks to decision). Same material works; it is
> written to their public-goods criteria.

> Positioning note: the Solana Foundation funds **public goods** with **open
> source** contributions, a **Solana-specific** rationale, and **measurable
> milestones**. So this application leads with the open-source *verification
> infrastructure*, not with "an insurance product" — and it is explicit that
> the grant funds protocol development, **not** the token or any raise.

---

## 1. One-liner  ·  **137 / 150 chars**

> Open-source parametric cover infrastructure on Solana — an autonomous oracle that verifies real-world events and settles claims on-chain.

Leads with *open-source* (the Foundation's headline criterion), names the
mechanism, states the outcome. Alternates, all under 150:

| | chars | |
|---|---|---|
| B | 142 | Parametric cover on Solana: policies as on-chain accounts, claims verified by an open-source oracle, payouts executed by code — not adjusters. |
| C | 140 | An open-source oracle and verifier network on Solana that settles real-world cover claims on-chain — no adjuster, no discretion, no waiting. |
| D | 132 | Open-source infrastructure for parametric cover on Solana: real-world events verified by oracle, claims settled on-chain in minutes. |
| E | 134 | Parametric cover infrastructure on Solana — open-source oracle verifies real-world events, program logic pays the claim. No adjusters. |

## 2. Project summary (short field)

CrypSurance is building the settlement layer for parametric cover on Solana:
policies as on-chain accounts, claims verified against real-world event data by
an autonomous oracle, and payouts executed by program logic instead of a claims
department. Everything is MIT-licensed and running today on devnet — anyone can
take a free test token from our faucet and run a complete buy-cover → claim →
oracle-verify → payout loop in about two minutes, then verify every step on
Solana Explorer.

We are asking for 10,000 USDC to replace our working prototype's transaction-memo
data model with real Anchor programs, get them independently reviewed, and
publish the verification layer as reusable open-source infrastructure for any
Solana project that needs real-world event verification.

## 3. The problem

Insurance fails people in two specific, mechanical ways: **discretion** and
**latency**. A company decides whether you get paid, and it takes weeks to
months. In India this is felt most sharply — a large share of the population is
un- or underinsured (industry estimates put the global figure in the billions),
and small-ticket cover (a delayed flight, a damaged shipment, a missed
connection) is economically impossible to administer manually because the claims
overhead exceeds the premium.

Parametric cover fixes both: the trigger is objective data, and settlement is
automatic. The missing piece is not the idea — it is trustworthy, open
**verification and settlement infrastructure**. That is what we are building.

## 4. What already exists (please click these)

This is not a proposal for something we might build. It runs now:

| | |
|---|---|
| Live product | <https://crypsurance.io/testnet> |
| Verifier Network portal | <https://network.crypsurance.io> |
| Source (MIT) | <https://github.com/rjsalaria/crypsurance> |
| Autonomous oracle | [`.github/workflows/oracle.yml`](https://github.com/rjsalaria/crypsurance/blob/main/.github/workflows/oracle.yml) — public run history |
| SURETY devnet mint | `8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9` |

Shipped and working on devnet:

- **A complete claim lifecycle.** Buy cover with a real SPL token transfer →
  file a claim → an oracle verifies it against live flight data → the pool pays
  out on-chain. Every step is a real devnet transaction.
- **An autonomous claims oracle.** Runs every 30 minutes via GitHub Actions, with
  a public run history. It settles what it can verify from data, and when data is
  inconclusive it escalates on-chain to human verification rather than guessing.
- **A public Verifier Network console.** Anyone can watch policies, claims,
  verifications and payouts stream off-chain-free, no wallet required.
- **A self-serve faucet.** Paste a devnet address, get test tokens, try to break
  it. No signup, no wallet connection, no gatekeeping.

**Honest statement of stage:** today policies are recorded as structured
transaction memos and the underwriting pool is an operator-held wallet, with a
single oracle operator. It is a working, fully-transparent prototype — it is not
yet trustless. Closing exactly that gap is what this grant funds.

## 5. Why Solana specifically

Parametric micro-cover only works if the settlement cost is far below the
premium. A realistic travel-delay premium is a couple of dollars; a claim
involves several transactions (policy, claim, verification, payout). On a chain
with dollar-scale fees the unit economics are simply negative — the product
cannot exist. Solana's sub-cent fees and sub-second finality are what make
small-ticket automated cover viable at all, and they are why "payout in minutes"
is a real target rather than marketing copy.

We also depend on Solana-native primitives directly: SPL tokens for premiums and
payouts, associated token accounts created on the user's behalf, and (next) PDAs
for policy accounts and a program-owned vault.

## 6. Why this is a public good

The commercial product is cover. The **public good is the verification layer**,
and we are funding that half:

1. **An open-source parametric claims oracle** any Solana project can fork —
   event-data adapters, an escalation path for inconclusive data, and on-chain
   settlement records. Real-world verification is a recurring unsolved need for
   RWA, prediction-market, logistics and travel projects on Solana.
2. **The Verifier Network spec and console** — a public, wallet-free view of how
   a claim was decided and on what basis, so verification is auditable by anyone
   rather than asserted.
3. **A free, permanent devnet testbed** — faucet, test token, and a complete
   working reference implementation of an end-to-end on-chain claims flow, which
   is a genuinely scarce learning resource for builders.
4. **Everything MIT-licensed**, developed in public, with the deployment and
   operations runbooks published in-repo.

## 7. What the grant funds — milestones

Milestone-based, each with a publicly verifiable deliverable.

**Milestone 1 — Anchor programs on devnet (weeks 1–4) · 4,000 USDC**
Policy, vault and claims programs written in Anchor and deployed to devnet.
Policies become PDA accounts instead of memos; premiums go into a
program-owned vault that no human key can drain arbitrarily.
*Deliverable:* deployed program IDs + source in the public repo.

**Milestone 2 — Migration + independent review (weeks 5–8) · 3,500 USDC**
Frontend migrated from memos to program calls; policy certificates minted as
real NFTs; an independent security review of the programs, with the report
published in full — including anything it finds.
*Deliverable:* live migrated dApp + published review report.

**Milestone 3 — Verifier Network v1 (weeks 9–12) · 2,500 USDC**
Multi-source verification with M-of-N operator consensus on devnet, replacing
the single-operator oracle, plus documentation and an integration guide so
other Solana teams can reuse the verification layer.
*Deliverable:* running multi-operator oracle + public integration docs.

### Budget

| Item | USDC |
|---|---|
| Anchor program development (policy, vault, claims) — 3 months | 5,000 |
| Independent security review of the programs | 2,500 |
| Infrastructure: RPC, real-time event-data feeds, hosting (12 mo) | 1,200 |
| Community testnet bug bounty (paid in USDC, not tokens) | 1,000 |
| Documentation, integration guide, tutorial content (open source) | 300 |
| **Total** | **10,000** |

**The grant does not fund the token.** No grant money goes to a token launch,
liquidity, marketing of a raise, or any distribution to holders. It funds
open-source protocol engineering and its review, only.

## 8. Why India

India is both the sharpest version of the problem and the best place to prove
the solution: very large under-insured population, high-volume small-ticket
travel and logistics risk, and strong developer density. The flows we are
building — flight delay, transit, shipment — are everyday Indian problems where
manual claims administration costs more than the claim. Proving automated
settlement here matters more than proving it in a market that is already
well-served.

## 9. Team

Solo founder-builder (Rajendra Salaria), building in public, based in India.
Everything listed in section 4 was shipped from a standing start — the working
devnet protocol, the autonomous oracle, the verifier portal and the faucet.
Development is AI-assisted, which is why the shipping cadence is high for one
person; the architecture decisions, on-chain design and operations are mine.

## 10. Regulatory posture (stated upfront)

We are deliberately **testnet-only** and use the word *cover*, not *insurance*,
for anything offered — no regulated product is being sold, and no real-money
premium is accepted anywhere. The devnet token is explicitly play money with no
value and no conversion to any future asset. Licensing is intentionally deferred:
the goal is that the technology is production-ready on the day a jurisdiction
provides a workable framework, not to operate ahead of one. We would rather show
a reviewer this position clearly than have them find it themselves.

## 11. Links

- Product: <https://crypsurance.io> · testnet: <https://crypsurance.io/testnet>
- Verifier Network: <https://network.crypsurance.io>
- Code (MIT): <https://github.com/rjsalaria/crypsurance>
- Whitepaper: <https://crypsurance.io/whitepaper.pdf>
- X: <https://x.com/crypsurance> · Telegram: <https://t.me/suretytoken_official>

---

## How to submit

1. Go to <https://superteam.fun/earn/grants/solana-foundation-india-grants/>
2. **Apply Now** → sign in to Superteam Earn (Google/wallet). The form is behind
   the login, so the exact field names may differ slightly from the labels below
   — the answers in the next section cover everything these forms ask.
3. Have ready before you start:
   - **Solana wallet address for disbursement** — use a *mainnet* address you
     control (⚠️ **not** the devnet pool wallet `9txX…Bkxy`, and never paste a
     private key anywhere).
   - **KYC details** — grants are paid to a real person; Indian PAN/ID is
     typically requested at payout, not at application.
   - Links from section 11.
4. Optional but worth it: a short intro DM to
   [@paarugsethi](https://x.com/paarugsethi) (the listing contact) with the
   testnet link — regional grant leads respond well to a working product.

**On the ask size:** the cap is 10k and the average is $4,667. 10k is defensible
here because the milestones are concrete and there is a shipped product behind
them — but it is the ceiling, so expect more scrutiny. If you would rather
optimise for a fast yes, drop Milestone 2's independent review to a lighter
peer review and ask **7,000**.

## Paste-ready short answers

**Project name:** CrypSurance

**One-line description:** *(137 chars — fits a 150 limit)*
Open-source parametric cover infrastructure on Solana — an autonomous oracle that verifies real-world events and settles claims on-chain.

**Amount requested:** 10,000 USDC

**What are you building?**
The settlement layer for parametric cover: policies as on-chain accounts, claims
verified against real-world event data, payouts executed by program logic instead
of a claims department. A complete buy → claim → verify → payout loop already
runs on devnet and is MIT-licensed. The grant replaces our memo-based prototype
with real Anchor programs, funds an independent review, and publishes the
verification layer as reusable open-source infrastructure.

**Why now / traction:**
Working devnet product with an autonomous oracle settling claims every 30
minutes, a public verifier console, and a self-serve faucet so anyone can run
the full loop in two minutes and verify it on Solana Explorer.

**Use of funds:** Anchor programs (5,000) · independent security review (2,500) ·
infrastructure and event-data feeds (1,200) · community testnet bug bounty
(1,000) · open-source docs (300).

---

## Loom video pitch — script & shot list

**Format:** screen recording + small camera bubble · **target 2:30, hard cap 3:00.**
Reviewers watch a lot of these; the ones that win *show working software*.
Most applicants present slides — your entire edge is that the product runs, so
the demo is the pitch. Don't build a deck.

### Before you hit record

1. **Pre-stage a settled policy.** The oracle runs on a 30-min cron — you cannot
   wait on camera. Beforehand: buy cover on `TEST-DELAY`, request the claim,
   then settle it instantly yourself:
   ```bash
   cd solana && node process-claims.js --pay
   ```
   Now your policy table shows a **Paid ✓** row with a real payout tx to point at.
2. Top up the pool wallet's devnet SOL (`node solana/faucet-status.js`) so the
   faucet can't fail mid-demo.
3. Open these tabs in order: `crypsurance.io/testnet` · the GitHub repo ·
   the Actions tab (oracle run history) · a Solana Explorer payout tx.
4. Close anything with private keys, `.env` files, or wallet seed phrases on
   screen. Check your notification popups are silenced.

### Script

**0:00–0:20 · Camera on you. Hook.**
> "Hi, I'm Rajendra, building CrypSurance from India. Insurance fails people in
> two mechanical ways: a company decides whether you get paid, and it takes
> months. We're building the settlement layer that removes both — and rather
> than pitch it, I'll just run it for you on devnet right now."

**0:20–1:20 · Screen share. The live loop — this is the whole pitch.**
> "This is our testnet page. I paste a wallet address into the faucet — no
> signup, no wallet connection — and test tokens arrive."
> *(show faucet result)*
> "Now I buy cover on a delayed flight. My premium moves as a real SPL transfer
> and the policy terms are written into the transaction itself."
> *(approve in Phantom, show the certificate)*
> "I file a claim. And here" — *(point at the pre-settled Paid ✓ row)* — "is one
> the oracle already settled. No human touched it. Here's the payout on Solana
> Explorer."
> *(open the explorer tab)*
> "That oracle runs every 30 minutes on its own — this is its public run
> history." *(GitHub Actions tab)*

**1:20–1:50 · The honest gap → the ask.**
> "Now the part I want to be upfront about. Today a policy is a structured
> transaction memo, and the pool is a wallet I control. It's transparent and it
> works — but it is not yet trustless, and I'd rather tell you that than have you
> find it. Closing exactly that gap is what I'm asking you to fund."

**1:50–2:20 · Milestones + budget.**
> "Ten thousand USDC, three milestones. First: Anchor programs on devnet —
> policies become PDA accounts and premiums move into a program-owned vault no
> human key can drain. Second: migrate the app to those programs, mint real NFT
> certificates, and publish an independent security review in full, including
> whatever it finds. Third: replace the single oracle with multi-operator
> consensus, and document it so any Solana team needing real-world verification
> can reuse it. It's all MIT-licensed — the verification layer is the public
> good here."

**2:20–2:35 · Camera. Close.**
> "Small-ticket cover only works where fees are sub-cent and finality is
> instant — that's why this is on Solana and nowhere else. Everything I showed
> is live at crypsurance.io/testnet, and the code's on GitHub. Thanks for
> watching."

### After recording — do not skip

- Set the Loom to **"Anyone with the link can view."** Loom often defaults to
  workspace-only; a reviewer hitting a permission wall is an instant rejection.
  **Test the link in a private/incognito window before you paste it.**
- Re-watch once with sound. If you fumble the first 20 seconds, re-record just
  that — the hook is the only part everyone watches to the end.
