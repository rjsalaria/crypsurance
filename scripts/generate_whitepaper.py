"""Generate public/whitepaper.pdf — the CrypSurance whitepaper.

Rerun after editing:  python scripts/generate_whitepaper.py
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Drawing, Wedge, String, Rect
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table,
    TableStyle, PageBreak, KeepTogether,
)

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "whitepaper.pdf")

# ---------- brand ----------
VOID = colors.HexColor("#060312")
VIOLET = colors.HexColor("#8b5cf6")
CYAN = colors.HexColor("#0ea5b7")   # darker cyan for print legibility
MAGENTA = colors.HexColor("#c026d3")
INK = colors.HexColor("#1a1530")
MUTED = colors.HexColor("#5a5478")
LIGHT = colors.HexColor("#f4f2fb")
LIME = colors.HexColor("#65a30d")

PAGE_W, PAGE_H = A4

# ---------- styles ----------
def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=15, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "h1": st("h1", fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=INK, spaceBefore=8, spaceAfter=10),
    "h2": st("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=VIOLET, spaceBefore=14, spaceAfter=5),
    "body": st("body", spaceAfter=7),
    "bullet": st("bullet", leftIndent=14, bulletIndent=4, spaceAfter=4),
    "eyebrow": st("eyebrow", fontName="Helvetica-Bold", fontSize=8.5, textColor=CYAN, spaceAfter=2),
    "small": st("small", fontSize=8, leading=11, textColor=MUTED),
    "tablehead": st("tablehead", fontName="Helvetica-Bold", fontSize=9, textColor=colors.white),
    "tablecell": st("tablecell", fontSize=9, leading=12),
    "tablecellb": st("tablecellb", fontName="Helvetica-Bold", fontSize=9, leading=12),
}

def P(text, style="body"):
    return Paragraph(text, S[style])

def bullets(items):
    return [Paragraph(f"• {t}", S["bullet"]) for t in items]

def section(eyebrow, title):
    return [P(eyebrow.upper(), "eyebrow"), P(title, "h1")]

# ---------- page furniture ----------
def cover_page(c, doc):
    c.saveState()
    c.setFillColor(VOID)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # accent glow bands
    c.setFillColor(colors.HexColor("#120a2e"))
    c.circle(PAGE_W * 0.85, PAGE_H * 0.9, 180, stroke=0, fill=1)
    c.circle(PAGE_W * 0.1, PAGE_H * 0.15, 150, stroke=0, fill=1)
    # gradient bar
    bar_y = PAGE_H * 0.52
    for i, col in enumerate([CYAN, VIOLET, MAGENTA]):
        c.setFillColor(col)
        c.rect(PAGE_W * 0.12 + i * 40 * mm / 3 * 2.2, bar_y, 28 * mm, 1.2 * mm, stroke=0, fill=1)
    # official brand mark (transparent PNG)
    logo = os.path.join(os.path.dirname(__file__), "..", "public", "logo.png")
    logo_size = 130
    c.drawImage(
        logo,
        PAGE_W / 2 - logo_size / 2,
        PAGE_H * 0.665,
        logo_size,
        logo_size,
        mask="auto",
    )
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(PAGE_W / 2, PAGE_H * 0.585, "CrypSurance")
    c.setFillColor(colors.HexColor("#a89fd0"))
    c.setFont("Helvetica", 13)
    c.drawCentredString(PAGE_W / 2, PAGE_H * 0.45, "Decentralized Insurance for the On-Chain World")
    c.setFont("Helvetica", 10)
    c.drawCentredString(PAGE_W / 2, PAGE_H * 0.40, "Whitepaper  ·  Version 1.0  ·  July 2026")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#6f6894"))
    c.drawCentredString(PAGE_W / 2, PAGE_H * 0.07, "crypsurance.io")
    c.restoreState()

def interior_page(c, doc):
    c.saveState()
    # header rule
    c.setFillColor(VIOLET)
    c.rect(20 * mm, PAGE_H - 16 * mm, 8 * mm, 1 * mm, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(30 * mm, PAGE_H - 16.5 * mm, "CRYPSURANCE  WHITEPAPER  V1.0")
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 20 * mm, PAGE_H - 16.5 * mm, "crypsurance.io")
    # footer
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(PAGE_W / 2, 12 * mm, f"{doc.page - 1}")
    c.restoreState()

# ---------- charts ----------
ALLOC = [
    ("Underwriting & staking rewards", 30, VIOLET),
    ("Presale", 20, CYAN),
    ("Community & ecosystem", 15, MAGENTA),
    ("DEX liquidity", 13, LIME),
    ("Team", 12, colors.HexColor("#f59e0b")),
    ("Treasury", 10, colors.HexColor("#64748b")),
]

def donut():
    d = Drawing(400, 190)
    cx, cy, r = 95, 95, 78
    start = 90
    for label, pct, col in ALLOC:
        extent = -pct * 3.6
        w = Wedge(cx, cy, r, start + extent, start, radius1=42)
        w.fillColor = col
        w.strokeColor = colors.white
        w.strokeWidth = 1.5
        d.add(w)
        start += extent
    d.add(String(cx, cy + 4, "1B", fontName="Helvetica-Bold", fontSize=18, fillColor=INK, textAnchor="middle"))
    d.add(String(cx, cy - 12, "SURE", fontName="Helvetica", fontSize=9, fillColor=MUTED, textAnchor="middle"))
    # legend
    y = 160
    for label, pct, col in ALLOC:
        d.add(Rect(205, y, 9, 9, fillColor=col, strokeColor=None))
        d.add(String(220, y + 1, f"{label} — {pct}%", fontName="Helvetica", fontSize=9, fillColor=INK))
        y -= 22
    return d

# ---------- tables ----------
def styled_table(header, rows, widths):
    data = [[Paragraph(h, S["tablehead"]) for h in header]]
    for row in rows:
        data.append([Paragraph(str(cell), S["tablecell"]) for cell in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d4ee")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t

# ---------- document ----------
story = []

# --- 1. Abstract
story += section("01 · Abstract", "The $1 trillion protection gap")
story += [
    P("Roughly <b>89% of crypto holders carry no insurance</b> on their digital assets — a global protection "
      "gap exceeding <b>$1 trillion</b>. Meanwhile, two billion people in emerging economies remain underinsured "
      "in traditional markets because legacy insurance cannot reach them profitably: distribution is expensive, "
      "claims are adversarial, and trust is scarce."),
    P("CrypSurance is a decentralized insurance protocol that rebuilds the insurance stack on smart contracts. "
      "Policies are minted as immutable on-chain contracts; community liquidity pools underwrite risk; "
      "decentralized oracles verify covered events; and payouts settle automatically — in minutes, not months. "
      "The protocol is governed and secured by its native utility token, <b>SURE</b>."),
    P("This document describes the protocol architecture, product lines, the SURE token economy, the presale "
      "structure, governance, and the delivery roadmap."),
]

# --- 2. Problem
story += section("02 · The Problem", "Insurance works. Its plumbing doesn't.")
story += [
    P("Insurance is one of humanity's oldest financial primitives — pooled risk in exchange for a premium. "
      "The failure is operational, not conceptual:"),
]
story += bullets([
    "<b>Opaque claims.</b> Decisions happen behind closed doors, at the insurer's discretion, with an incentive to deny.",
    "<b>Slow settlement.</b> Average claim cycles run 30–180 days across major non-life categories.",
    "<b>Extractive overhead.</b> A large share of every premium funds distribution, administration and shareholder returns — not claims.",
    "<b>Gated access.</b> Coverage is rationed by geography, credit history and paperwork. Billions are simply unreachable.",
    "<b>Crypto is excluded.</b> Legacy insurers largely refuse digital-asset risk; the few products that exist "
    "carve out phishing, key loss and exchange failure — precisely the events users fear.",
])

# --- 3. Solution / architecture
story += section("03 · The Protocol", "Policies as code, pools as capital, oracles as adjusters")
story += [
    P("CrypSurance replaces the insurance company with three composable layers:"),
    P("<b>1 — Policy layer.</b> Every policy is a smart contract minted at purchase. Coverage terms, premium, "
      "duration, covered events and payout logic are encoded on-chain, identical for every buyer, and readable by anyone."),
    P("<b>2 — Capital layer.</b> Underwriting pools collateralize policies. SURE stakers deposit into pools "
      "(e.g. wallet cover, DeFi cover, parametric travel) and earn a pro-rata share of premiums in exchange for "
      "backing the risk. Pool solvency is a public, real-time on-chain number — not a rating-agency opinion."),
    P("<b>3 — Verification layer.</b> Covered events are confirmed by multiple independent oracle feeds "
      "(flight status, weather, chain analytics, mortality registries where legally available). When oracle "
      "consensus confirms an event, the policy contract executes the payout with no human in the loop. "
      "A dispute window lets token holders challenge anomalous results before settlement; disputed claims "
      "escalate to a governance vote."),
    P("<b>Claim lifecycle:</b> event occurs → oracle consensus (multiple sources) → policy validity check → "
      "pool payout to the policyholder's wallet. Target settlement time: <b>under 5 minutes</b> for parametric products."),
]

# --- 4. Products
story += section("04 · Products", "Two product lines at launch")
story += [
    P("<b>Non-Life (launches first).</b> Parametric coverage for objectively verifiable events: travel disruption, "
      "wallet/custody compromise, DeFi protocol exploits, and property perils where reliable data feeds exist. "
      "Parametric design means the payout amount is fixed in advance and triggered by the event itself — "
      "no loss assessment required."),
    P("<b>Life (second phase).</b> Smart-contract life coverage with beneficiaries written into the policy. "
      "Payout executes on oracle-verified proof of death where compliant registry oracles are available. "
      "Rollout is jurisdiction-by-jurisdiction, gated on regulatory clarity."),
    P("Premiums are payable in stablecoins or SOL. SURE holders receive a <b>15% premium discount</b>, "
      "already implemented in the protocol's coverage calculator."),
]

story.append(PageBreak())

# --- 5. Token
story += section("05 · SURE Token", "One token, four jobs")
story += bullets([
    "<b>Governance</b> — vote on coverage categories, pool parameters, oracle sets and treasury spending.",
    "<b>Underwriting</b> — stake SURE into pools that collateralize live policies.",
    "<b>Yield</b> — stakers earn a pro-rata share of every premium paid into their pool.",
    "<b>Utility</b> — 15% premium discount and priority access to new products for holders.",
])
story += [
    P("<b>Token standard:</b> SPL token on Solana with Metaplex metadata. "
      "<b>Total supply:</b> 1,000,000,000 SURE — fixed: the mint authority is revoked at creation, "
      "so no further tokens can ever be created. Protocol programs are built with Anchor and externally audited."),
    Spacer(1, 6),
    P("Token distribution", "h2"),
    donut(),
    Spacer(1, 4),
]

story.append(styled_table(
    ["Allocation", "%", "Tokens", "Vesting"],
    [
        ["Underwriting & staking rewards", "30%", "300M", "Emitted over 36–48 months, proportional to pool participation"],
        ["Presale", "20%", "200M", "40% at TGE, remainder linear over 3 months"],
        ["Community & ecosystem", "15%", "150M", "Testnet rewards, airdrops, referrals — released by governance"],
        ["DEX liquidity", "13%", "130M", "Paired with ~65% of raise; LP locked 24 months (Streamflow)"],
        ["Team", "12%", "120M", "12-month cliff, then 30-month linear vest. Zero at TGE"],
        ["Treasury", "10%", "100M", "3-of-5 multisig, address published at TGE"],
    ],
    [58 * mm, 12 * mm, 16 * mm, 84 * mm],
))

# --- 6. Presale
story += section("06 · Presale", "A raise sized to be filled, not flaunted")
story.append(styled_table(
    ["Parameter", "Value"],
    [
        ["Chain / platform", "Solana via PinkSale launchpad"],
        ["Soft cap / hard cap", "$150,000 / $250,000"],
        ["Presale price", "$0.00125 per SURE (200M tokens ÷ $250k hard cap)"],
        ["Listing price", "$0.0014 per SURE (+12% over presale)"],
        ["Listing venue", "Raydium — ~65% of raise into LP, locked 24 months"],
        ["Anti-whale", "Maximum buy 2% of hard cap per wallet"],
        ["Unsold tokens", "Burned"],
        ["Fully diluted valuation at listing", "$1.4M"],
    ],
    [55 * mm, 115 * mm],
))
story += [
    Spacer(1, 6),
    P("<b>Use of proceeds:</b> ~65% DEX liquidity (locked) · ~15% security audits and legal opinions · "
      "~12% marketing and community growth · ~8% protocol development runway."),
    P("Team tokens are absent from the market at launch by design: a 12-month cliff means the team can only "
      "be paid by the protocol succeeding, not by the listing candle."),
]

story.append(PageBreak())

# --- 7. Governance
story += section("07 · Governance", "Progressive decentralization")
story += [
    P("Governance launches as a constrained token vote and widens as the protocol proves itself:"),
]
story += bullets([
    "<b>Phase 1 (launch):</b> team multisig executes; SURE votes are binding signals on pool parameters and listings.",
    "<b>Phase 2 (post-audit #2):</b> on-chain governor contract controls pool creation, oracle sets and treasury spend.",
    "<b>Phase 3:</b> full DAO — protocol upgrades require token-holder approval with timelock.",
])

# --- 8. Roadmap
story += section("08 · Roadmap", "Shipping order")
story.append(styled_table(
    ["Period", "Milestone", "Detail"],
    [
        ["2026", "Testnet + SURE TGE", "Token created on devnet (done), mainnet token generation event, PinkSale presale and Raydium listing; insurance products built and tested on testnet (demo live at crypsurance.io/app)"],
        ["Q2 2027", "Mainnet products + audit", "Independent audits of policy, vault and claims programs; parametric non-life products live on mainnet; staking pools open"],
        ["Q4 2027", "Life products & expansion", "On-chain life coverage with nominee payouts (first jurisdictions), institutional underwriting partners, multi-chain expansion"],
    ],
    [22 * mm, 38 * mm, 110 * mm],
))

# --- 9. Risks
story += section("09 · Risk Factors", "What can go wrong")
story += bullets([
    "<b>Smart-contract risk.</b> Code can contain defects. Mitigation: independent audits, bug bounty, staged caps on pool size.",
    "<b>Oracle risk.</b> Data feeds can fail or be manipulated. Mitigation: multi-source consensus, dispute window, governance escalation.",
    "<b>Capital risk.</b> Correlated claims could stress a pool. Mitigation: per-pool exposure caps, diversification requirements, treasury backstop.",
    "<b>Regulatory risk.</b> Insurance and token sales are regulated activities in most jurisdictions. The protocol geo-blocks "
    "restricted jurisdictions from the presale and rolls out regulated product categories only where legally cleared.",
    "<b>Market risk.</b> SURE, like all tokens, can lose value. Participation should be sized accordingly.",
])

# --- 10. Disclaimer
story += section("10 · Legal Disclaimer", "Read this")
story += [
    P("This whitepaper is for information only. It is not a prospectus, an offer of securities, insurance, or "
      "financial advice, and it does not form part of any contract. SURE is a utility token intended for use "
      "within the CrypSurance protocol; it confers no equity, dividend, or claim on any legal entity. "
      "Participation in the presale is prohibited for residents of jurisdictions where such participation is "
      "restricted, including where required the United States, and is subject to the presale terms published at "
      "crypsurance.io. Forward-looking statements (including the roadmap) reflect current intentions and may "
      "change. Digital assets are volatile and you may lose everything you commit. Do your own research and "
      "consult qualified legal and financial advisers.", "small"),
    Spacer(1, 10),
    P("© 2026 CrypSurance · crypsurance.io · x.com/crypsurance · t.me/suretoken_official", "small"),
]

# ---------- build ----------
doc = BaseDocTemplate(
    os.path.abspath(OUT),
    pagesize=A4,
    title="CrypSurance Whitepaper v1.0",
    author="CrypSurance",
    subject="Decentralized Insurance for the On-Chain World",
)
frame = Frame(20 * mm, 20 * mm, PAGE_W - 40 * mm, PAGE_H - 44 * mm, id="main")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=cover_page),
    PageTemplate(id="interior", frames=[frame], onPage=interior_page),
])

from reportlab.platypus import NextPageTemplate
full_story = [NextPageTemplate("interior"), PageBreak()] + story
doc.build(full_story)
print(f"OK -> {os.path.abspath(OUT)}")
