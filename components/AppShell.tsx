"use client";

import DemoJourney from "./DemoJourney";

/* ---------------- staking (simulated) ---------------- */

const pools = [
  { name: "Wallet & custody pool", apy: 14.2, tvl: "4.8M", util: 62 },
  { name: "DeFi cover pool", apy: 18.7, tvl: "3.1M", util: 78 },
  { name: "Parametric travel pool", apy: 9.4, tvl: "1.9M", util: 41 },
  { name: "Life cover pool", apy: 11.8, tvl: "2.6M", util: 55 },
];

function Staking() {
  return (
    <div className="glass-card p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">The other side: earn by protecting others</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        Where does payout money come from? These community pools. SURE stakers
        deposit into them, back real policies, and earn a share of every
        premium. Simulated testnet data.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {pools.map((p) => (
          <div key={p.name} className="rounded-2xl bg-void/60 border border-muted/20 p-5 hover:border-violet-neon/50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display font-bold text-sm">{p.name}</h3>
              <span className="font-display font-bold text-lime-neon whitespace-nowrap">{p.apy}% APY</span>
            </div>
            <div className="mt-4 flex justify-between text-xs text-muted">
              <span>TVL ${p.tvl}</span>
              <span>Utilization {p.util}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-neon to-violet-neon"
                style={{ width: `${p.util}%` }}
              />
            </div>
            <button
              disabled
              title="Staking opens at mainnet launch"
              className="mt-4 w-full py-2 rounded-xl border border-violet-neon/50 text-sm font-semibold opacity-50 cursor-not-allowed"
            >
              Stake (opens at mainnet)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- example policies (simulated) ---------------- */

const mockPolicies = [
  { id: "CS-2026-114202", type: "Life + Money Back", covered: "$50,000", premium: "$34.65/mo", status: "Active", until: "Jul 2036" },
  { id: "CS-2026-108817", type: "Travel Delay", covered: "$500", premium: "$12 once", status: "Paid out ✓", until: "Jan 2027" },
  { id: "CS-2026-101450", type: "Term Life", covered: "$100,000", premium: "$42/mo", status: "Active", until: "Aug 2041" },
];

function Policies() {
  return (
    <div className="glass-card p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">Live policy register (sample)</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        On mainnet every policy is publicly verifiable — anyone can confirm the
        protocol's total obligations at any moment. Sample data shown.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm min-w-130">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
              <th className="py-3 pr-4">Certificate</th>
              <th className="py-3 pr-4">Product</th>
              <th className="py-3 pr-4">Cover</th>
              <th className="py-3 pr-4">Premium</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3">Until</th>
            </tr>
          </thead>
          <tbody>
            {mockPolicies.map((p) => (
              <tr key={p.id} className="border-b border-muted/10 last:border-0">
                <td className="py-3.5 pr-4 font-mono text-cyan-neon">{p.id}</td>
                <td className="py-3.5 pr-4">{p.type}</td>
                <td className="py-3.5 pr-4 font-mono">{p.covered}</td>
                <td className="py-3.5 pr-4 font-mono">{p.premium}</td>
                <td className="py-3.5 pr-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      p.status === "Active"
                        ? "bg-lime-neon/15 text-lime-neon"
                        : "bg-cyan-neon/15 text-cyan-neon"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="py-3.5 text-muted">{p.until}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- shell ---------------- */

export default function AppShell() {
  return (
    <div className="space-y-8">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-magenta-neon/40 bg-magenta-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-magenta-neon">
          <span className="h-1.5 w-1.5 rounded-full bg-magenta-neon animate-pulse" />
          Interactive demo · no real money
        </span>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold">
          Buy insurance in <span className="text-gradient">2 minutes</span> — try it
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          A complete walkthrough of how CrypSurance works, for everyone — no
          crypto knowledge needed. Everything below is simulated on testnet.
        </p>
      </div>

      <DemoJourney />
      <Staking />
      <Policies />
    </div>
  );
}
