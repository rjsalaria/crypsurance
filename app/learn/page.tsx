import type { Metadata } from "next";
import Link from "next/link";
import Blobs from "@/components/Blobs";
import SectionHeading from "@/components/SectionHeading";
import ClaimFlow from "@/components/ClaimFlow";

export const metadata: Metadata = {
  title: "How Decentralized Cover Works",
  description:
    "See how CrypSurance replaces adjusters and paperwork with smart contracts, oracles and community underwriting pools — and who benefits.",
};

const comparison = [
  { dim: "Claim decision", trad: "Adjuster's discretion, behind closed doors", defi: "Oracle data consensus, verifiable by anyone" },
  { dim: "Payout speed", trad: "Often 30–180 days", defi: "Minutes after verification" },
  { dim: "Policy terms", trad: "40 pages of fine print", defi: "Open-source contract, identical for everyone" },
  { dim: "Who profits", trad: "Shareholders of the insurer", defi: "The community that stakes and underwrites" },
  { dim: "Access", trad: "Gated by geography, credit, paperwork", defi: "Anyone with a wallet, anywhere" },
  { dim: "Trust model", trad: "Trust the company", defi: "Trust the code — and audit it yourself" },
];

const benefits = [
  {
    title: "No middlemen",
    text: "Premiums flow to the pools that actually carry your risk — not to branch offices, brokers and ad budgets.",
    icon: "M6 18L18 6M8 6h10v10",
  },
  {
    title: "Instant settlement",
    text: "Verified event → automatic payout. The contract can't slow-walk you, lose your file, or 'escalate to a supervisor.'",
    icon: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  },
  {
    title: "Transparent pools",
    text: "Every pool's capital, every policy, every payout is on-chain. Solvency isn't a rating-agency opinion — it's a public number.",
    icon: "M12 5c-5 0-9 3.5-10 7 1 3.5 5 7 10 7s9-3.5 10-7c-1-3.5-5-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  },
  {
    title: "Global by default",
    text: "2 billion people are underinsured because branches don't reach them. A wallet does.",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z",
  },
];

const personas = [
  {
    who: "Crypto holders",
    benefit:
      "Protect your portfolio against the risks legacy insurers won't touch — and join the 11% who are actually covered.",
    accent: "text-cyan-neon",
  },
  {
    who: "DeFi users",
    benefit:
      "Hedge smart-contract and protocol risk while earning yield on the other side as an underwriter. Both sides of the book are open to you.",
    accent: "text-violet-neon",
  },
  {
    who: "Institutions",
    benefit:
      "Auditable, real-time solvency data and programmatic policies — risk management your compliance team can actually verify.",
    accent: "text-magenta-neon",
  },
];

export default function LearnPage() {
  return (
    <>
      <Blobs />

      {/* hero */}
      <section className="pt-40 pb-16 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-neon">
            The demo
          </p>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            Insurance is a 300-year-old promise.
            <br />
            <span className="text-gradient">We made it self-executing.</span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-muted leading-relaxed">
            Watch a claim travel from real-world event to settled payout — then
            see why decentralizing the industry benefits everyone except the
            paperwork.
          </p>
        </div>
      </section>

      {/* interactive walkthrough */}
      <section className="px-4 sm:px-6 pb-24">
        <div className="mx-auto max-w-6xl">
          <ClaimFlow />
        </div>
      </section>

      {/* broken vs decentralized */}
      <section className="px-4 sm:px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Why change anything?"
            title={
              <>
                Traditional insurance vs{" "}
                <span className="text-gradient">the protocol.</span>
              </>
            }
            subtitle="The product isn't broken — the plumbing is. Here's what changes when the plumbing becomes a smart contract."
          />
          <div className="mt-12 glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted/15 text-left">
                  <th className="px-5 py-4 font-display text-muted font-semibold w-1/4"> </th>
                  <th className="px-5 py-4 font-display font-bold">Traditional insurer</th>
                  <th className="px-5 py-4 font-display font-bold text-gradient">CrypSurance</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.dim} className="border-b border-muted/10 last:border-0">
                    <td className="px-5 py-4 font-semibold text-muted align-top">{row.dim}</td>
                    <td className="px-5 py-4 text-muted align-top">{row.trad}</td>
                    <td className="px-5 py-4 align-top">
                      <span className="flex items-start gap-2">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 mt-0.5 shrink-0 text-lime-neon" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {row.defi}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* benefits grid */}
      <section className="px-4 sm:px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="The upside"
            title={
              <>
                What decentralization{" "}
                <span className="text-gradient">actually buys you.</span>
              </>
            }
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <div key={b.title} className="glass-card glass-card-hover p-6">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-cyan-neon" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d={b.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 className="mt-4 font-display font-bold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* personas */}
      <section className="px-4 sm:px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Who benefits"
            title={
              <>
                Built for both sides{" "}
                <span className="text-gradient">of the risk.</span>
              </>
            }
            subtitle="Policyholders get protection. Underwriters get yield. The protocol matches them without taking a house cut for shareholders."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {personas.map((p) => (
              <div key={p.who} className="glass-card glass-card-hover p-8">
                <h3 className={`font-display text-xl font-bold ${p.accent}`}>{p.who}</h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">{p.benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 pb-8">
        <div className="mx-auto max-w-6xl glass-card ring-glow text-center px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold">
            Convinced? <span className="text-gradient">Try the testnet preview.</span>
          </h2>
          <p className="mt-4 text-muted max-w-xl mx-auto">
            Price a policy with the coverage calculator and explore the staking
            dashboard — no wallet required for the demo.
          </p>
          <div className="mt-8">
            <Link href="/app" className="btn-gradient inline-block px-8 py-3.5 rounded-2xl font-display font-bold text-white">
              Try the Demo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
