"use client";

import { useMemo, useState } from "react";

/* ---------------- wallet ---------------- */

function WalletButton({
  connected,
  onToggle,
}: {
  connected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={
        connected
          ? "px-5 py-2.5 rounded-xl border border-lime-neon/50 text-lime-neon font-mono text-sm hover:bg-lime-neon/10 transition-colors"
          : "btn-gradient px-5 py-2.5 rounded-xl font-display font-bold text-white"
      }
    >
      {connected ? "0xC1a9…5uR3 · Disconnect" : "Connect Wallet"}
    </button>
  );
}

/* ---------------- calculator ---------------- */

const coverageTypes = [
  { id: "wallet", label: "Wallet / custody cover", baseRate: 0.024 },
  { id: "defi", label: "DeFi protocol cover", baseRate: 0.031 },
  { id: "travel", label: "Travel (parametric)", baseRate: 0.018 },
  { id: "property", label: "Property cover", baseRate: 0.021 },
  { id: "life", label: "Life cover", baseRate: 0.014 },
] as const;

function Calculator({ connected }: { connected: boolean }) {
  const [amount, setAmount] = useState(10000);
  const [type, setType] = useState<(typeof coverageTypes)[number]["id"]>("wallet");
  const [months, setMonths] = useState(12);
  const [holdsSure, setHoldsSure] = useState(true);

  const quote = useMemo(() => {
    const rate = coverageTypes.find((c) => c.id === type)!.baseRate;
    const durationFactor = months / 12;
    // longer commitments earn a small loyalty discount, SURE holders 15% off
    const loyalty = months >= 12 ? 0.92 : 1;
    const sureDiscount = holdsSure ? 0.85 : 1;
    const premium = amount * rate * durationFactor * loyalty * sureDiscount;
    return {
      premium,
      monthly: premium / months,
      effectiveRate: amount > 0 ? (premium / amount / durationFactor) * 100 : 0,
    };
  }, [amount, type, months, holdsSure]);

  return (
    <div className="glass-card ring-glow p-6 sm:p-8" id="calculator">
      <h2 className="font-display text-2xl font-bold">Coverage calculator</h2>
      <p className="mt-1 text-sm text-muted">
        Live premium estimate — testnet pricing model.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <label htmlFor="calc-amount" className="text-sm font-semibold">
              Coverage amount (USD)
            </label>
            <input
              id="calc-amount"
              type="number"
              min={100}
              step={100}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-4 py-3 font-mono focus:border-cyan-neon focus:outline-none"
            />
            <input
              type="range"
              min={1000}
              max={500000}
              step={1000}
              value={Math.min(amount, 500000)}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Coverage amount slider"
              className="mt-3 w-full accent-violet-500"
            />
          </div>

          <div>
            <label htmlFor="calc-type" className="text-sm font-semibold">
              Coverage type
            </label>
            <select
              id="calc-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-4 py-3 focus:border-cyan-neon focus:outline-none"
            >
              {coverageTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="calc-months" className="text-sm font-semibold">
              Duration: <span className="text-cyan-neon font-mono">{months} months</span>
            </label>
            <input
              id="calc-months"
              type="range"
              min={1}
              max={36}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="mt-3 w-full accent-violet-500"
            />
          </div>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={holdsSure}
              onChange={(e) => setHoldsSure(e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            I hold SURE tokens (15% premium discount)
          </label>
        </div>

        {/* quote panel */}
        <div className="rounded-2xl bg-void/70 border border-violet-neon/30 p-6 flex flex-col">
          <p className="text-xs uppercase tracking-widest text-muted">Estimated premium</p>
          <p data-testid="quote-total" className="mt-2 font-display text-4xl sm:text-5xl font-bold text-gradient">
            ${quote.premium.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <div className="mt-6 space-y-3 text-sm flex-1">
            <div className="flex justify-between">
              <span className="text-muted">Monthly</span>
              <span className="font-mono">
                ${quote.monthly.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Effective annual rate</span>
              <span className="font-mono">{quote.effectiveRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Industry range</span>
              <span className="font-mono text-muted">1% – 5%</span>
            </div>
          </div>
          <button
            disabled={!connected}
            className="btn-gradient mt-6 w-full py-3 rounded-xl font-display font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {connected ? "Mint policy (testnet)" : "Connect wallet to mint"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- staking ---------------- */

const pools = [
  { name: "Wallet & custody pool", apy: 14.2, tvl: "4.8M", util: 62 },
  { name: "DeFi cover pool", apy: 18.7, tvl: "3.1M", util: 78 },
  { name: "Parametric travel pool", apy: 9.4, tvl: "1.9M", util: 41 },
  { name: "Life cover pool", apy: 11.8, tvl: "2.6M", util: 55 },
];

function Staking({ connected }: { connected: boolean }) {
  return (
    <div className="glass-card p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">Staking pools</h2>
      <p className="mt-1 text-sm text-muted">
        Stake SURE to underwrite policies and earn premium yield. Simulated testnet data.
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
              disabled={!connected}
              className="mt-4 w-full py-2 rounded-xl border border-violet-neon/50 text-sm font-semibold hover:bg-violet-neon/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stake
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- policies ---------------- */

const mockPolicies = [
  { id: "POL-0x4f2a", type: "DeFi cover", covered: "$25,000", premium: "$645", status: "Active", until: "Mar 2027" },
  { id: "POL-0x91cc", type: "Travel (parametric)", covered: "$3,000", premium: "$41", status: "Claimed ✓", until: "Jan 2027" },
  { id: "POL-0x7b18", type: "Wallet cover", covered: "$60,000", premium: "$1,180", status: "Active", until: "Aug 2027" },
];

function Policies({ connected }: { connected: boolean }) {
  return (
    <div className="glass-card p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">Your policies</h2>
      {!connected ? (
        <p className="mt-4 text-sm text-muted">
          Connect a wallet to view your policies. (In this preview, connecting
          loads demo data.)
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm min-w-130">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
                <th className="py-3 pr-4">Policy</th>
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Covered</th>
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
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
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
      )}
    </div>
  );
}

/* ---------------- shell ---------------- */

export default function AppShell() {
  const [connected, setConnected] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-magenta-neon/40 bg-magenta-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-magenta-neon">
            <span className="h-1.5 w-1.5 rounded-full bg-magenta-neon animate-pulse" />
            Testnet preview
          </span>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold">
            CrypSurance <span className="text-gradient">App</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            All data is simulated. No real funds move here — yet.
          </p>
        </div>
        <WalletButton connected={connected} onToggle={() => setConnected((c) => !c)} />
      </div>

      <Calculator connected={connected} />
      <Staking connected={connected} />
      <Policies connected={connected} />
    </div>
  );
}
