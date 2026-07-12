"use client";

import { useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* demo data + pricing (illustrative testnet model)                    */
/* ------------------------------------------------------------------ */

const DEMO_ADDRESS = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

type Billing = "monthly" | "yearly" | "once";

type Plan = {
  id: string;
  name: string;
  tagline: string;
  plain: string;
  icon: string;
  billing: Billing;
  hasTerm: boolean; // show the years slider (life products)
  usesNominee: boolean; // nominee step applies
  rate: number; // premium factor on coverage
  ropRefund: boolean; // return-of-premium at maturity
  covMin: number;
  covMax: number;
  covStep: number;
  covDefault: number;
  covLabel: string;
  benefit: (cov: string) => string; // main "you get" bullet
};

const plans: Plan[] = [
  {
    id: "term",
    name: "Term Life",
    tagline: "Maximum protection, minimum cost",
    plain:
      "You pay a small amount monthly. If the worst happens during the term, the person you nominate automatically receives the full cover amount. A safety net for your family.",
    icon: "M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z",
    billing: "monthly",
    hasTerm: true,
    usesNominee: true,
    rate: 0.00042,
    ropRefund: false,
    covMin: 10000, covMax: 250000, covStep: 5000, covDefault: 50000,
    covLabel: "Cover amount (what your family receives)",
    benefit: (cov) =>
      `<b>$${cov} paid to your nominee</b> automatically if the covered event happens — within minutes, no paperwork for your family`,
  },
  {
    id: "rop",
    name: "Life + Money Back",
    tagline: "Protected, and your premiums returned",
    plain:
      "Same protection as Term Life — but if nothing happens by the end of the term, you get 100% of everything you paid back. Protection that costs you nothing if you never need it.",
    icon: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 7v5l3 3",
    billing: "monthly",
    hasTerm: true,
    usesNominee: true,
    rate: 0.00042 * 1.65,
    ropRefund: true,
    covMin: 10000, covMax: 250000, covStep: 5000, covDefault: 50000,
    covLabel: "Cover amount (what your family receives)",
    benefit: (cov) =>
      `<b>$${cov} paid to your nominee</b> automatically if the covered event happens — within minutes, no paperwork for your family`,
  },
  {
    id: "health",
    name: "Health",
    tagline: "Hospital bills, handled",
    plain:
      "A monthly subscription that covers hospitalization costs. Verified bills are settled to your wallet in minutes — no cashless-desk queues, no discharge-day battles.",
    icon: "M12 21C7 16.5 3 13 3 8.8 3 6 5.2 4 7.8 4c1.6 0 3.2.8 4.2 2.2C13 4.8 14.6 4 16.2 4 18.8 4 21 6 21 8.8c0 4.2-4 7.7-9 12.2z",
    billing: "monthly",
    hasTerm: false,
    usesNominee: false,
    rate: 0.0009,
    ropRefund: false,
    covMin: 10000, covMax: 500000, covStep: 10000, covDefault: 100000,
    covLabel: "Hospitalization cover per year",
    benefit: (cov) =>
      `Hospital bills covered up to <b>$${cov} per year</b> — verified and settled to your wallet in minutes`,
  },
  {
    id: "accident",
    name: "Accident",
    tagline: "Big protection, tiny premium",
    plain:
      "Personal accident cover for pocket change. If an accident leaves you disabled, you get paid. In the worst case, your nominee does — automatically.",
    icon: "M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01",
    billing: "monthly",
    hasTerm: false,
    usesNominee: true,
    rate: 0.00012,
    ropRefund: false,
    covMin: 10000, covMax: 500000, covStep: 10000, covDefault: 100000,
    covLabel: "Accident cover amount",
    benefit: (cov) =>
      `Up to <b>$${cov} paid to you</b> if an accident leaves you disabled — and to your nominee in the worst case`,
  },
  {
    id: "vehicle",
    name: "Vehicle",
    tagline: "Your car, covered by code",
    plain:
      "Yearly cover for accident damage and theft. Claims are verified with oracle data and photo proof — payout lands in your wallet, not in a 45-day pipeline.",
    icon: "M5 16l1.5-5.5h11L19 16M3.5 16h17M5.5 16v3h2.5v-2h8v2h2.5v-3M8 13.2h.01M16 13.2h.01",
    billing: "yearly",
    hasTerm: false,
    usesNominee: false,
    rate: 0.03,
    ropRefund: false,
    covMin: 2000, covMax: 150000, covStep: 1000, covDefault: 15000,
    covLabel: "Vehicle value (max payout)",
    benefit: (cov) =>
      `Up to <b>$${cov} for accident damage or theft</b> — oracle + photo-proof verification, paid to your wallet`,
  },
  {
    id: "travel",
    name: "Travel",
    tagline: "Full trip protection",
    plain:
      "One payment per trip. Medical emergencies abroad, lost baggage, trip cancellation — verified against travel data and paid straight to your wallet, wherever you are.",
    icon: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z",
    billing: "once",
    hasTerm: false,
    usesNominee: false,
    rate: 0.0016,
    ropRefund: false,
    covMin: 5000, covMax: 100000, covStep: 5000, covDefault: 25000,
    covLabel: "Trip cover (medical, baggage, cancellation)",
    benefit: (cov) =>
      `Up to <b>$${cov} for medical emergencies, lost baggage or cancellation</b> — verified by travel-data oracles, paid to your wallet`,
  },
  {
    id: "delay",
    name: "Travel Delay",
    tagline: "Instant payout, no claim forms",
    plain:
      "Pay once before your trip. If your flight is delayed 3+ hours, money lands in your wallet automatically — usually before you leave the airport.",
    icon: "M2.5 19h19M6 16l4-12 8.5 8.5M10 4l8 4",
    billing: "once",
    hasTerm: false,
    usesNominee: false,
    rate: 0.024,
    ropRefund: false,
    covMin: 100, covMax: 2000, covStep: 50, covDefault: 500,
    covLabel: "Payout if your flight is delayed",
    benefit: (cov) =>
      `<b>$${cov} instantly to your wallet</b> if your flight is delayed 3+ hours — automatic, no claim to file`,
  },
];

const usd = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

const billingUnit: Record<Billing, string> = {
  monthly: " /month",
  yearly: " /year",
  once: " once",
};

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-neon">
        Step {n} of 5
      </p>
      <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{title}</h2>
      <p className="mt-2 text-muted text-sm sm:text-base leading-relaxed">{sub}</p>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "Continue →",
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl border border-muted/30 font-semibold hover:border-muted/60 transition-colors"
        >
          ← Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="btn-gradient px-8 py-3 rounded-xl font-display font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {nextLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the journey                                                         */
/* ------------------------------------------------------------------ */

export default function DemoJourney() {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [planId, setPlanId] = useState("term");
  const [coverage, setCoverage] = useState(50000);
  const [years, setYears] = useState(10);
  const [nominee, setNominee] = useState({ name: "", relation: "Spouse", wallet: "" });
  const [mintLog, setMintLog] = useState<string[]>([]);
  const [minted, setMinted] = useState(false);
  const [policyId, setPolicyId] = useState("");

  const plan = plans.find((p) => p.id === planId)!;

  const price = useMemo(() => {
    const base = Math.max(5, coverage * plan.rate);
    const totalPaid = plan.hasTerm ? base * 12 * years : base;
    return {
      amount: base,
      totalPaid,
      refund: plan.ropRefund ? totalPaid : 0,
    };
  }, [plan, coverage, years]);

  const selectPlan = (p: Plan) => {
    setPlanId(p.id);
    setCoverage(p.covDefault);
  };

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
    }, 1200);
  };

  const mint = () => {
    setStep(4);
    setMinted(false);
    setMintLog([]);
    const id = `CS-2026-${String(Math.floor(100000 + Math.random() * 899999))}`;
    setPolicyId(id);
    const lines = [
      "Wallet signature requested… approved ✓",
      "Minting your policy as a smart contract…",
      plan.usesNominee
        ? `Writing nominee "${nominee.name || "—"}" into the contract ✓`
        : "Registering payout destination: your wallet ✓",
      "Locking terms — no one can change them now ✓",
      `Certificate ${id} issued ✓`,
    ];
    lines.forEach((l, i) => {
      setTimeout(() => {
        setMintLog((prev) => [...prev, l]);
        if (i === lines.length - 1) setTimeout(() => setMinted(true), 500);
      }, 900 * (i + 1));
    });
  };

  const restart = () => {
    setStep(0);
    setMinted(false);
    setMintLog([]);
    setNominee({ name: "", relation: "Spouse", wallet: "" });
  };

  const labels = ["Connect", "Choose", "Price", "Nominee", "Certificate"];

  return (
    <div className="glass-card ring-glow p-6 sm:p-10">
      {/* progress */}
      <ol className="flex items-center gap-1 sm:gap-2 mb-10" aria-label="Demo progress">
        {labels.map((l, i) => (
          <li key={l} className="flex items-center gap-1 sm:gap-2 flex-1 last:flex-none">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-display font-bold ${
                i < step || (i === 4 && minted)
                  ? "bg-lime-neon/90 text-void"
                  : i === step
                    ? "bg-cyan-neon text-void pulse-ring"
                    : "bg-surface text-muted"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={`hidden md:block text-xs font-semibold ${i === step ? "text-ink" : "text-muted"}`}>
              {l}
            </span>
            {i < 4 && <span className="h-px flex-1 bg-muted/20 hidden sm:block" />}
          </li>
        ))}
      </ol>

      {/* ============ STEP 0 — CONNECT ============ */}
      {step === 0 && (
        <div>
          <StepHeader
            n={1}
            title="Connect your wallet"
            sub="A crypto wallet is your login AND your bank account in one — no signup forms, no passwords, no branch visits. In this demo we'll simulate one for you."
          />
          <div className="rounded-2xl bg-void/60 border border-muted/20 p-6 max-w-md">
            {!connected ? (
              <button
                onClick={connect}
                disabled={connecting}
                className="btn-gradient w-full py-3.5 rounded-xl font-display font-bold text-white disabled:opacity-70"
              >
                {connecting ? "Connecting…" : "Connect Wallet (simulated)"}
              </button>
            ) : (
              <div className="animate-fade-up">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-neon animate-pulse" />
                  <span className="font-mono text-sm text-lime-neon">{short(DEMO_ADDRESS)}</span>
                  <span className="text-xs text-muted">connected</span>
                </div>
                <div className="mt-4 flex justify-between text-sm border-t border-muted/15 pt-4">
                  <span className="text-muted">Demo balance</span>
                  <span className="font-mono">2,500 USDC · 12.4 SOL</span>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-xs text-muted max-w-md">
            🔒 On the real app this opens Phantom or Solflare. Your keys never
            leave your device — CrypSurance can never touch your money without
            a transaction you approve.
          </p>
          {connected && <NavButtons onNext={() => setStep(1)} />}
        </div>
      )}

      {/* ============ STEP 1 — CHOOSE PLAN ============ */}
      {step === 1 && (
        <div>
          <StepHeader
            n={2}
            title="Choose your protection"
            sub="Seven products, explained in plain words. Pick one to see real numbers."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPlan(p)}
                aria-pressed={planId === p.id}
                className={`text-left rounded-2xl border p-5 transition-all ${
                  planId === p.id
                    ? "border-cyan-neon/70 bg-cyan-neon/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                    : "border-muted/20 hover:border-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-cyan-neon shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d={p.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                    {p.billing === "once" ? "pay once" : p.billing}
                  </span>
                </div>
                <h3 className="mt-3 font-display font-bold">{p.name}</h3>
                <p className="text-xs text-cyan-neon font-semibold mt-0.5">{p.tagline}</p>
                <p className="mt-2 text-xs text-muted leading-relaxed">{p.plain}</p>
              </button>
            ))}
          </div>
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}

      {/* ============ STEP 2 — PRICE: PAY vs GET ============ */}
      {step === 2 && (
        <div>
          <StepHeader
            n={3}
            title="What you pay — and what you get"
            sub="Move the sliders. The deal updates instantly, and it's the same deal for everyone — no agent, no negotiation, no fine print."
          />
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <label htmlFor="dj-coverage" className="text-sm font-semibold">
                  {plan.covLabel}: <span className="text-cyan-neon font-mono">${usd(coverage)}</span>
                </label>
                <input
                  id="dj-coverage"
                  type="range"
                  min={plan.covMin}
                  max={plan.covMax}
                  step={plan.covStep}
                  value={coverage}
                  onChange={(e) => setCoverage(Number(e.target.value))}
                  className="mt-3 w-full accent-violet-500"
                />
              </div>
              {plan.hasTerm && (
                <div>
                  <label htmlFor="dj-years" className="text-sm font-semibold">
                    Protection period: <span className="text-cyan-neon font-mono">{years} years</span>
                  </label>
                  <input
                    id="dj-years"
                    type="range"
                    min={5}
                    max={30}
                    step={1}
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="mt-3 w-full accent-violet-500"
                  />
                </div>
              )}
              <div className="rounded-xl bg-violet-neon/10 border border-violet-neon/30 p-4 text-xs text-muted leading-relaxed">
                💡 <b className="text-ink">Why so transparent?</b> There is no
                insurance company here. Your premium goes into a shared pool
                backed by other members. The contract — not a claims
                department — decides payouts. That's why it can promise
                minutes, not months.
              </div>
            </div>

            {/* the deal */}
            <div className="rounded-2xl bg-void/70 border border-violet-neon/30 p-6">
              <h3 className="font-display font-bold text-lg">Your deal — {plan.name}</h3>
              <div className="mt-5 space-y-4">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-muted/15">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted">You pay</p>
                    <p className="mt-1 font-display text-3xl font-bold">
                      ${usd(price.amount)}
                      <span className="text-sm font-normal text-muted">{billingUnit[plan.billing]}</span>
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {plan.hasTerm
                        ? `$${usd(price.totalPaid)} total over ${years} years`
                        : plan.billing === "monthly"
                          ? "Cancel anytime — no lock-in"
                          : plan.billing === "yearly"
                            ? "Renews yearly, cancel anytime"
                            : "One payment, covered for the whole trip"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted">You get</p>
                  <ul className="mt-2 space-y-2.5 text-sm">
                    <li className="flex gap-2.5">
                      <span className="text-lime-neon">✓</span>
                      <span dangerouslySetInnerHTML={{ __html: plan.benefit(usd(coverage)) }} />
                    </li>
                    {plan.ropRefund && (
                      <li className="flex gap-2.5">
                        <span className="text-lime-neon">✓</span>
                        <span>
                          <b>${usd(price.refund)} back to you</b> at the end of {years} years if no claim — every premium returned
                        </span>
                      </li>
                    )}
                    <li className="flex gap-2.5">
                      <span className="text-lime-neon">✓</span>
                      <span>A <b>digital bond certificate</b> in your wallet — your permanent, tamper-proof proof of cover</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-lime-neon">✓</span>
                      <span>Terms locked in code — <b>nobody can deny, delay or change</b> your policy</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {/* ============ STEP 3 — NOMINEE ============ */}
      {step === 3 && (
        <div>
          <StepHeader
            n={4}
            title={plan.usesNominee ? "Name your nominee" : "Who gets paid?"}
            sub={
              plan.usesNominee
                ? "Your nominee is written directly into the smart contract. If the covered event happens, the payout goes to them automatically — they never have to prove anything to a company, chase documents, or wait."
                : `${plan.name} cover pays YOU directly — the money simply appears in your connected wallet. No nominee needed.`
            }
          />
          {!plan.usesNominee ? (
            <div className="rounded-2xl bg-void/60 border border-muted/20 p-6 max-w-md">
              <p className="text-xs uppercase tracking-widest text-muted">Payout destination</p>
              <p className="mt-2 font-mono text-lime-neon">{short(DEMO_ADDRESS)} (you)</p>
              <p className="mt-3 text-xs text-muted">
                Covered event verified by oracles → payout lands here. Done.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 max-w-md">
              <div>
                <label htmlFor="dj-name" className="text-sm font-semibold">Nominee's name</label>
                <input
                  id="dj-name"
                  type="text"
                  placeholder="e.g. Anita Sharma"
                  value={nominee.name}
                  onChange={(e) => setNominee({ ...nominee, name: e.target.value })}
                  className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-4 py-3 focus:border-cyan-neon focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="dj-relation" className="text-sm font-semibold">Relationship</label>
                <select
                  id="dj-relation"
                  value={nominee.relation}
                  onChange={(e) => setNominee({ ...nominee, relation: e.target.value })}
                  className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-4 py-3 focus:border-cyan-neon focus:outline-none"
                >
                  {["Spouse", "Child", "Parent", "Sibling", "Other"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dj-wallet" className="text-sm font-semibold">
                  Nominee's wallet address <span className="text-muted font-normal">(can be added later)</span>
                </label>
                <input
                  id="dj-wallet"
                  type="text"
                  placeholder="Their Solana address — or leave empty for now"
                  value={nominee.wallet}
                  onChange={(e) => setNominee({ ...nominee, wallet: e.target.value })}
                  className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-4 py-3 font-mono text-sm focus:border-cyan-neon focus:outline-none"
                />
                <p className="mt-2 text-xs text-muted">
                  No wallet yet? They can claim with identity proof through the
                  guardian process — or you add their address any time.
                </p>
              </div>
            </div>
          )}
          <NavButtons
            onBack={() => setStep(2)}
            onNext={mint}
            nextLabel="Buy policy (simulated) →"
            nextDisabled={plan.usesNominee && nominee.name.trim().length < 2}
          />
        </div>
      )}

      {/* ============ STEP 4 — MINT + CERTIFICATE ============ */}
      {step === 4 && (
        <div>
          {!minted ? (
            <div>
              <StepHeader
                n={5}
                title="Creating your policy…"
                sub="Watch what happens on-chain. This takes seconds — and it's the whole process. No medical forms, no waiting period for approval."
              />
              <div className="rounded-2xl bg-void/80 border border-muted/20 p-5 font-mono text-sm max-w-xl min-h-44">
                {mintLog.map((l, i) => (
                  <p key={i} className={`py-1 animate-fade-up ${i === mintLog.length - 1 ? "text-cyan-neon" : "text-muted"}`}>
                    <span className="text-violet-neon">›</span> {l}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-fade-up">
              <StepHeader
                n={5}
                title="Your digital bond certificate 🎉"
                sub="This certificate lives in your wallet forever — cryptographic proof of your cover that no company can lose, revoke or dispute."
              />

              {/* certificate */}
              <div className="relative max-w-2xl rounded-2xl p-[2px] bg-gradient-to-br from-cyan-neon via-violet-neon to-magenta-neon">
                <div className="rounded-2xl bg-void/95 p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4 pb-5 border-b border-muted/20">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted">CrypSurance Protocol</p>
                      <h3 className="font-display text-xl sm:text-2xl font-bold mt-1">
                        Policy Bond Certificate
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full border-2 border-lime-neon/70 text-lime-neon text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rotate-6">
                      Active
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-5 text-sm">
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">Certificate No.</dt>
                      <dd className="font-mono text-cyan-neon mt-0.5">{policyId}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">Product</dt>
                      <dd className="font-semibold mt-0.5">{plan.name} Insurance</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">Policyholder</dt>
                      <dd className="font-mono mt-0.5">{short(DEMO_ADDRESS)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">
                        {plan.usesNominee ? "Nominee" : "Payout to"}
                      </dt>
                      <dd className="font-semibold mt-0.5">
                        {plan.usesNominee ? `${nominee.name} · ${nominee.relation}` : "Policyholder (you)"}
                        {plan.usesNominee && (
                          <span className="block font-mono text-xs text-muted mt-0.5">
                            {nominee.wallet ? short(nominee.wallet) : "wallet to be linked"}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">Cover amount</dt>
                      <dd className="font-display font-bold text-lg text-gradient mt-0.5">
                        ${usd(coverage)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-widest text-muted">Premium</dt>
                      <dd className="mt-0.5">
                        ${usd(price.amount)}
                        <span className="text-muted">{billingUnit[plan.billing]}{plan.hasTerm ? ` · ${years} yrs` : ""}</span>
                      </dd>
                    </div>
                    {plan.ropRefund && (
                      <div className="col-span-2">
                        <dt className="text-[10px] uppercase tracking-widest text-muted">Maturity benefit</dt>
                        <dd className="mt-0.5 text-lime-neon font-semibold">
                          100% premium return (${usd(price.refund)}) if no claim by maturity
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="flex items-end justify-between gap-4 pt-4 border-t border-muted/20">
                    <p className="text-[10px] text-muted leading-relaxed max-w-xs">
                      Secured by smart contract on Solana · terms immutable ·
                      verify anytime on-chain · Demo certificate — testnet only
                    </p>
                    <svg viewBox="0 0 40 40" className="h-14 w-14 shrink-0 text-ink" fill="currentColor" aria-label="Verification code">
                      <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="29" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="1" y="29" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                      <rect x="4" y="4" width="4" height="4" /><rect x="32" y="4" width="4" height="4" /><rect x="4" y="32" width="4" height="4" />
                      <rect x="15" y="3" width="3" height="3" /><rect x="21" y="6" width="3" height="3" /><rect x="15" y="12" width="3" height="3" />
                      <rect x="24" y="15" width="3" height="3" /><rect x="30" y="18" width="3" height="3" /><rect x="15" y="21" width="3" height="3" />
                      <rect x="21" y="24" width="3" height="3" /><rect x="27" y="30" width="3" height="3" /><rect x="33" y="27" width="3" height="3" />
                      <rect x="18" y="33" width="3" height="3" /><rect x="24" y="36" width="3" height="3" /><rect x="18" y="15" width="3" height="3" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={restart} className="px-6 py-3 rounded-xl border border-muted/30 font-semibold hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors">
                  ↻ Try another product
                </button>
                <a href="/#token" className="btn-gradient px-8 py-3 rounded-xl font-display font-bold text-white">
                  I'm convinced — about SURETY
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
