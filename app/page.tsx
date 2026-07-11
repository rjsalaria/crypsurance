import Link from "next/link";
import Blobs from "@/components/Blobs";
import SectionHeading from "@/components/SectionHeading";
import StatCounter from "@/components/StatCounter";

const products = [
  {
    title: "Life Insurance",
    tag: "On-chain legacy",
    description:
      "Smart-contract powered life coverage. Beneficiaries are written into the policy contract itself — payouts execute automatically, transparently, with zero paperwork for your loved ones.",
    features: ["Automated beneficiary payout", "Transparent policy terms on-chain", "No medical paperwork maze"],
    accent: "from-violet-neon to-magenta-neon",
  },
  {
    title: "Non-Life Insurance",
    tag: "Everyday protection",
    description:
      "Decentralized coverage for property, vehicles, travel and more — underwritten by community liquidity pools and settled by oracle-verified triggers instead of claim adjusters.",
    features: ["Property, vehicle & travel cover", "Community pool underwriting", "Parametric instant settlement"],
    accent: "from-cyan-neon to-violet-neon",
  },
];

const steps = [
  {
    n: "01",
    title: "Buy cover",
    text: "Pick a policy, pay the premium in crypto. Your policy is minted as a smart contract — terms locked, immutable, readable by anyone.",
  },
  {
    n: "02",
    title: "Pools underwrite",
    text: "SURE stakers provide liquidity to underwriting pools and earn premium yield for backing real-world risk.",
  },
  {
    n: "03",
    title: "Oracles verify",
    text: "When a covered event happens, decentralized oracles and parametric triggers verify it — no claim adjusters, no bias, no delays.",
  },
  {
    n: "04",
    title: "Instant payout",
    text: "The contract settles the moment verification lands. Funds arrive in your wallet in minutes, not months.",
  },
];

const tokenomics = [
  { label: "Underwriting pools", pct: 35, color: "#8b5cf6" },
  { label: "Community & ecosystem", pct: 25, color: "#22d3ee" },
  { label: "Team & advisors", pct: 15, color: "#e879f9" },
  { label: "Liquidity & listings", pct: 15, color: "#a3e635" },
  { label: "Treasury reserve", pct: 10, color: "#a89fd0" },
];

const utilities = [
  {
    title: "Governance",
    text: "Vote on coverage categories, pool parameters and protocol upgrades. The community steers the protocol.",
    icon: "M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z",
  },
  {
    title: "Staking rewards",
    text: "Stake SURE into underwriting pools and earn a share of every premium paid into the protocol.",
    icon: "M12 2v20M5 9l7-7 7 7M7 21h10",
  },
  {
    title: "Claim underwriting",
    text: "Staked SURE backs live policies. Deep pools mean bigger coverage capacity and stronger trust.",
    icon: "M4 7h16M4 12h16M4 17h10",
  },
  {
    title: "Fee discounts",
    text: "Hold SURE to unlock premium discounts and priority access to new coverage products.",
    icon: "M9 15L15 9M9.5 9.5h.01M14.5 14.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  },
];

const roadmap = [
  {
    quarter: "2026",
    title: "Testnet launch + SURE TGE",
    text: "Token created on devnet (done ✓), then mainnet TGE with presale and Raydium listing. Insurance products built and battle-tested on testnet alongside the community.",
    status: "active",
  },
  {
    quarter: "Q2 2027",
    title: "Mainnet products + audit",
    text: "Independent audits of the policy, vault and claims programs, then parametric non-life products go live on mainnet.",
    status: "next",
  },
  {
    quarter: "Q4 2027",
    title: "Life products & expansion",
    text: "On-chain life coverage with nominee payouts, institutional underwriting partnerships, and multi-chain expansion.",
    status: "future",
  },
];

const faqs = [
  {
    q: "How is CrypSurance different from traditional insurance?",
    a: "Traditional insurers decide your claim behind closed doors and can take months to pay. CrypSurance policies are smart contracts: terms are public, claims are verified by decentralized oracles, and payouts execute automatically — usually within minutes.",
  },
  {
    q: "What does the SURE token actually do?",
    a: "SURE is the protocol's utility token. It powers governance voting, earns staking rewards from premiums, provides underwriting liquidity that backs live policies, and unlocks fee discounts for holders.",
  },
  {
    q: "Who pays my claim if there's no insurance company?",
    a: "Community underwriting pools. SURE stakers deposit liquidity that collateralizes policies, and they earn premium yield in return. When a verified claim triggers, the pool pays out instantly by contract.",
  },
  {
    q: "What happens if oracles report a wrong result?",
    a: "The protocol uses multiple independent oracle sources plus a dispute window during which token holders can challenge a result. Disputed claims escalate to a community vote before settlement.",
  },
  {
    q: "Is my coverage valid worldwide?",
    a: "The protocol is permissionless and global by design — anyone with a wallet can buy parametric coverage. Regulated product categories will roll out region by region as legal frameworks are secured.",
  },
];

function donutSegments() {
  const r = 15.9155;
  let offset = 25;
  return tokenomics.map((t) => {
    const seg = (
      <circle
        key={t.label}
        cx="21"
        cy="21"
        r={r}
        fill="transparent"
        stroke={t.color}
        strokeWidth="5"
        strokeDasharray={`${t.pct} ${100 - t.pct}`}
        strokeDashoffset={offset}
      />
    );
    offset -= t.pct;
    return seg;
  });
}

export default function Home() {
  return (
    <>
      <Blobs />

      {/* ================= HERO ================= */}
      <section className="relative pt-40 pb-24 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="text-center lg:text-left order-2 lg:order-1">
            <p className="inline-block glass-card px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-neon animate-fade-up">
              89% of crypto holders are uninsured — a $1T+ protection gap
            </p>
            <h1 className="mt-8 font-display text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight animate-fade-up">
              Insurance for the
              <br />
              <span className="text-gradient">on-chain world.</span>
            </h1>
            <p className="mt-6 mx-auto lg:mx-0 max-w-2xl text-lg text-muted leading-relaxed animate-fade-up">
              CrypSurance replaces paperwork, adjusters and 90-day waits with
              smart contracts, oracle verification and instant payouts. Fair,
              fast and secure coverage — owned by its community.
            </p>
            <div className="mt-10 flex flex-wrap justify-center lg:justify-start gap-4 animate-fade-up">
              <Link
                href="/app"
                className="btn-gradient px-8 py-3.5 rounded-2xl font-display font-bold text-white"
              >
                Launch App
              </Link>
              <a
                href="/whitepaper.pdf"
                className="px-8 py-3.5 rounded-2xl font-display font-bold border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors"
              >
                Read Whitepaper
              </a>
            </div>
          </div>
          <div className="order-1 lg:order-2 flex justify-center [perspective:1200px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="CrypSurance shield logo"
              className="h-52 w-52 sm:h-72 sm:w-72 lg:h-85 lg:w-85 animate-spin-glow select-none"
              draggable={false}
            />
          </div>
        </div>

        {/* stats bar */}
        <div className="mx-auto max-w-5xl mt-24 glass-card ring-glow grid grid-cols-2 md:grid-cols-4 divide-x divide-muted/10">
          {[
            { v: 89, suffix: "%", label: "Crypto holders uninsured" },
            { v: 1, prefix: "$", suffix: "T+", label: "Global protection gap" },
            { v: 2, suffix: " min", label: "Target claim settlement" },
            { v: 100, suffix: "%", label: "On-chain transparency" },
          ].map((s) => (
            <div key={s.label} className="px-6 py-8 text-center">
              <p className="font-display text-3xl md:text-4xl font-bold text-gradient">
                <StatCounter value={s.v} prefix={s.prefix ?? ""} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-xs text-muted uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= PRODUCTS ================= */}
      <section className="px-4 sm:px-6 py-24" id="products">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Coverage"
            title={
              <>
                Two products.{" "}
                <span className="text-gradient">Zero middlemen.</span>
              </>
            }
            subtitle="Every policy is a smart contract: terms you can read, pools you can audit, payouts you don't have to beg for."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {products.map((p) => (
              <div key={p.title} className="glass-card glass-card-hover p-8">
                <span
                  className={`inline-block text-xs font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r ${p.accent}`}
                >
                  {p.tag}
                </span>
                <h3 className="mt-3 font-display text-2xl font-bold">{p.title}</h3>
                <p className="mt-3 text-muted leading-relaxed">{p.description}</p>
                <ul className="mt-6 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-lime-neon" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="px-4 sm:px-6 py-24" id="how">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Protocol"
            title={
              <>
                From premium to payout,{" "}
                <span className="text-gradient">all on-chain.</span>
              </>
            }
            subtitle="Four steps. No adjusters, no call centers, no 'your claim is being processed.'"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="glass-card glass-card-hover p-6">
                <span className="font-display text-4xl font-bold text-gradient">{s.n}</span>
                <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/learn" className="text-cyan-neon font-semibold hover:underline underline-offset-4">
              See the full interactive walkthrough →
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SURE TOKEN ================= */}
      <section className="px-4 sm:px-6 py-24 scroll-mt-24" id="token">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="SURE Token"
            title={
              <>
                The engine of the protocol:{" "}
                <span className="text-gradient">$SURE</span>
              </>
            }
            subtitle="One token that governs the protocol, underwrites its policies, and rewards the community that secures it."
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-2 items-center">
            {/* donut */}
            <div className="glass-card p-8 flex flex-col sm:flex-row items-center gap-8">
              <svg viewBox="0 0 42 42" className="h-52 w-52 shrink-0 -rotate-90" role="img" aria-label="SURE token distribution chart">
                {donutSegments()}
                <circle cx="21" cy="21" r="12" fill="#0b0620" />
              </svg>
              <div className="w-full">
                <h3 className="font-display font-bold text-lg mb-4">Token distribution</h3>
                <ul className="space-y-3">
                  {tokenomics.map((t) => (
                    <li key={t.label} className="flex items-center gap-3 text-sm">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="flex-1 text-muted">{t.label}</span>
                      <span className="font-display font-bold">{t.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* utilities */}
            <div className="grid gap-4 sm:grid-cols-2">
              {utilities.map((u) => (
                <div key={u.title} className="glass-card glass-card-hover p-6">
                  <svg viewBox="0 0 24 24" className="h-8 w-8 text-cyan-neon" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d={u.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h3 className="mt-4 font-display font-bold">{u.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{u.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= ROADMAP ================= */}
      <section className="px-4 sm:px-6 py-24 scroll-mt-24" id="roadmap">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Roadmap"
            title={
              <>
                Where we&apos;re headed —{" "}
                <span className="text-gradient">and how fast.</span>
              </>
            }
          />
          <ol className="mt-12 relative border-l border-muted/20 ml-3 space-y-12">
            {roadmap.map((r) => (
              <li key={r.quarter} className="relative pl-10">
                <span
                  className={`absolute -left-[9px] top-1 h-4.5 w-4.5 rounded-full border-2 ${
                    r.status === "active"
                      ? "bg-cyan-neon border-cyan-neon pulse-ring"
                      : r.status === "next"
                        ? "bg-violet-neon border-violet-neon"
                        : "bg-surface border-muted/40"
                  }`}
                />
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-neon">{r.quarter}</p>
                <h3 className="mt-1 font-display text-xl font-bold">{r.title}</h3>
                <p className="mt-2 text-sm text-muted max-w-xl leading-relaxed">{r.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="px-4 sm:px-6 py-24 scroll-mt-24" id="faq">
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            eyebrow="FAQ"
            title={
              <>
                Questions? <span className="text-gradient">Answered.</span>
              </>
            }
          />
          <div className="mt-10 space-y-4">
            {faqs.map((f) => (
              <details key={f.q} className="faq glass-card px-6 py-5 group">
                <summary className="flex items-center justify-between gap-4 font-display font-semibold">
                  {f.q}
                  <span className="chevron text-cyan-neon text-2xl leading-none shrink-0">+</span>
                </summary>
                <p className="mt-4 text-sm text-muted leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA BAND ================= */}
      <section className="px-4 sm:px-6 pb-8">
        <div className="mx-auto max-w-6xl glass-card ring-glow text-center px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            Don&apos;t be part of the{" "}
            <span className="text-gradient">89%.</span>
          </h2>
          <p className="mt-4 text-muted max-w-xl mx-auto">
            Explore the testnet preview, run the coverage calculator, and see
            what insurance looks like when the contract can&apos;t say no.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/app" className="btn-gradient px-8 py-3.5 rounded-2xl font-display font-bold text-white">
              Launch App
            </Link>
            <Link
              href="/learn"
              className="px-8 py-3.5 rounded-2xl font-display font-bold border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors"
            >
              Learn the Protocol
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
