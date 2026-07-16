import type { Metadata } from "next";
import Link from "next/link";
import Blobs from "@/components/Blobs";
import VerificationConsole from "@/components/VerificationConsole";

export const metadata: Metadata = {
  title: "Verifier Network — Event Data & Claims Verification",
  description:
    "The CrypSurance Verifier Network: genuine event data for claims verification, oracle checks, and partner/community escalation when data alone can't decide.",
};

const dataSources = [
  {
    name: "Testnet simulation",
    covers: "TEST-DELAY / TEST-ONTIME flights",
    status: "live",
    note: "Deterministic events so anyone can test the full claim loop.",
  },
  {
    name: "Flight status data",
    covers: "Flight delays & cancellations (global)",
    status: "live",
    note: "Live flight-data feed checked by the oracle operator for real flight numbers.",
  },
  {
    name: "On-chain analytics",
    covers: "Depeg events, protocol exploits, wallet drains",
    status: "phase-1",
    note: "Crypto-native events verified from chain data itself — next products.",
  },
  {
    name: "Weather & catastrophe feeds",
    covers: "Rainfall, storm, earthquake parameters",
    status: "phase-1",
    note: "Public meteorological agencies; enables parametric crop / travel / property covers.",
  },
  {
    name: "Rail & road incident data",
    covers: "Train / bus accident records",
    status: "tie-up",
    note: "Via transport-authority data partnerships (e.g. railway incident bulletins).",
  },
  {
    name: "Hospital admission records",
    covers: "Hospitalization events for health cover",
    status: "tie-up",
    note: "Requires healthcare data partners + consent flows; jurisdiction by jurisdiction.",
  },
  {
    name: "Civil registries",
    covers: "Death & accident certification for life cover",
    status: "tie-up",
    note: "The hardest and most regulated feed — licensed partners only (Phase 2).",
  },
];

const statusMeta: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-lime-neon/15 text-lime-neon" },
  "phase-1": { label: "In build", cls: "bg-cyan-neon/15 text-cyan-neon" },
  "tie-up": { label: "Partner tie-up", cls: "bg-violet-neon/15 text-violet-neon" },
};

export default function VerifyPage() {
  return (
    <>
      <Blobs />

      {/* hero */}
      <section className="pt-32 pb-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-neon">
            verify.crypsurance.io · preview
          </p>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold leading-tight">
            The <span className="text-gradient">Verifier Network.</span>
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Claims die or pay on one question: <em>did the event really
            happen?</em> This is where CrypSurance answers it — genuine event
            data from independent sources, oracle verification you can audit,
            and an escalation path to partners and the community when data
            alone can&apos;t decide.
          </p>
        </div>
      </section>

      {/* how it works */}
      <section className="px-4 sm:px-6 pb-10">
        <div className="mx-auto max-w-6xl grid gap-4 md:grid-cols-3">
          {[
            {
              n: "1",
              title: "Data first",
              text: "A claim arrives. The oracle checks it against independent event feeds — flight status, weather, chain analytics, partner registries.",
            },
            {
              n: "2",
              title: "Verified → instant settlement",
              text: "If the data confirms (or refutes) the event, the claim settles on-chain within minutes — payment and evidence recorded together.",
            },
            {
              n: "3",
              title: "No data → human network",
              text: "If no feed covers the event, an on-chain verification request opens below — routed to data partners and, over time, staked community verifiers.",
            },
          ].map((s) => (
            <div key={s.n} className="glass-card glass-card-hover p-6">
              <span className="font-display text-3xl font-bold text-gradient">{s.n}</span>
              <h3 className="mt-3 font-display font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* live console */}
      <section className="px-4 sm:px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <VerificationConsole />
        </div>
      </section>

      {/* data source registry */}
      <section className="px-4 sm:px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            Event data registry
          </h2>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            The feeds the network verifies against today — and the tie-ups that
            expand what can be covered. Every new data source unlocks a new
            insurance product.
          </p>
          <div className="mt-6 overflow-x-auto glass-card">
            <table className="w-full text-sm min-w-130">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
                  <th className="px-5 py-3.5">Source</th>
                  <th className="px-5 py-3.5">Verifies</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {dataSources.map((d) => (
                  <tr key={d.name} className="border-b border-muted/10 last:border-0 align-top">
                    <td className="px-5 py-3.5 font-semibold whitespace-nowrap">{d.name}</td>
                    <td className="px-5 py-3.5 text-muted">{d.covers}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusMeta[d.status].cls}`}>
                        {statusMeta[d.status].label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* the road to decentralization */}
      <section className="px-4 sm:px-6 pb-14">
        <div className="mx-auto max-w-6xl glass-card p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">
            From one operator to a network
          </h2>
          <p className="mt-2 text-sm text-muted max-w-3xl leading-relaxed">
            Today the oracle operator is the protocol team — every verification
            it makes is recorded on-chain where you can audit it. The roadmap
            decentralizes exactly this role: independent verifiers will stake
            SURETY to earn verification fees, answers will require M-of-N
            consensus across verifiers using independent data sources, and
            wrong answers will be slashed. Offline verification requests —
            today handled by partners — become bounties any staked community
            verifier can earn by resolving with evidence.
          </p>
        </div>
      </section>

      {/* partner CTA */}
      <section className="px-4 sm:px-6 pb-8">
        <div className="mx-auto max-w-6xl glass-card ring-glow text-center px-6 py-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            Own event data? <span className="text-gradient">Become a source.</span>
          </h2>
          <p className="mt-3 text-muted max-w-xl mx-auto text-sm">
            Airlines, hospitals, transport authorities, data companies,
            analytics firms — every feed you bring makes a new kind of cover
            possible, and data partners earn from every verification.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a
              href="https://t.me/suretoken_official"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gradient px-7 py-3 rounded-xl font-display font-bold text-white"
            >
              Talk to us on Telegram
            </a>
            <Link
              href="/testnet"
              className="px-7 py-3 rounded-xl font-display font-bold border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors"
            >
              Try the testnet
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
