import type { Metadata } from "next";
import Link from "next/link";
import Blobs from "@/components/Blobs";
import LiveDevnet from "@/components/LiveDevnet";

export const metadata: Metadata = {
  title: "Testnet — The Real Protocol",
  description:
    "The CrypSurance protocol being built in the open on Solana devnet: connect a real wallet, see the real SURETY token, and follow each milestone as it ships.",
};

const milestones = [
  {
    id: "M1",
    title: "Real wallet connection",
    text: "Connect Phantom or Solflare and read live devnet balances — including the real SURETY token.",
    status: "live",
  },
  {
    id: "M2",
    title: "Protocol programs",
    text: "The policy, vault and claims programs — the smart contracts that ARE the protocol — deployed to devnet.",
    status: "planned",
  },
  {
    id: "M3",
    title: "Buy real cover on devnet",
    text: "v1 is live: pay a real SURETY premium into the pool, policy terms recorded on-chain in the transaction. Policy accounts + certificate NFTs arrive with the M2 programs.",
    status: "testing",
  },
  {
    id: "M4",
    title: "Staking + oracle claims",
    text: "Stake into underwriting pools; watch an oracle-verified event trigger an automatic payout, end to end.",
    status: "planned",
  },
  {
    id: "M5",
    title: "Governance + Verifier Network",
    text: "Token voting, and the multi-provider verification protocol where staked verifiers confirm real-world events.",
    status: "planned",
  },
];

const statusStyle: Record<string, { label: string; cls: string }> = {
  live: { label: "Live ✓", cls: "bg-lime-neon/15 text-lime-neon border-lime-neon/40" },
  testing: { label: "V1 live", cls: "bg-cyan-neon/10 text-cyan-neon border-cyan-neon/40" },
  building: { label: "Next", cls: "bg-cyan-neon/10 text-cyan-neon border-cyan-neon/40" },
  planned: { label: "Planned", cls: "bg-surface text-muted border-muted/30" },
};

export default function TestnetPage() {
  return (
    <>
      <Blobs />

      <section className="pt-32 pb-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-lime-neon/40 bg-lime-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-lime-neon">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-neon animate-pulse" />
            Solana devnet · play money, real technology
          </span>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold leading-tight">
            The protocol, <span className="text-gradient">built in the open.</span>
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            This is not a simulation — everything on this page talks to the
            real Solana devnet. Each milestone ships here first, gets
            battle-tested by the community, and stands ready for the day
            regulation opens the door to mainnet. Prefer a gentle guided tour
            instead?{" "}
            <Link href="/app" className="text-cyan-neon hover:underline">
              Try the demo
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 pb-10">
        <div className="mx-auto max-w-6xl">
          <LiveDevnet />
        </div>
      </section>

      {/* milestones */}
      <section className="px-4 sm:px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            Build milestones
          </h2>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            The road from token to full protocol. Everything lands on this page
            as it ships — no promises, just working software.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((m) => (
              <div key={m.id} className="glass-card glass-card-hover p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-2xl font-bold text-gradient">{m.id}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${statusStyle[m.status].cls}`}>
                    {statusStyle[m.status].label}
                  </span>
                </div>
                <h3 className="mt-3 font-display font-bold">{m.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how to join */}
      <section className="px-4 sm:px-6 pb-8">
        <div className="mx-auto max-w-6xl glass-card ring-glow px-6 py-12">
          <h2 className="font-display text-2xl font-bold">Join the testnet in 3 steps</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3 text-sm">
            <li className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-neon text-void font-display font-bold">1</span>
              <div>
                <p className="font-semibold">Install Phantom</p>
                <p className="mt-1 text-muted">
                  phantom.com → create a wallet → Settings → Developer Settings
                  → switch on <b>Testnet Mode</b>.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-neon text-void font-display font-bold">2</span>
              <div>
                <p className="font-semibold">Get free devnet SOL</p>
                <p className="mt-1 text-muted">
                  faucet.quicknode.com/solana/devnet — connect Phantom, request.
                  It&apos;s play money for testing; it costs and is worth nothing.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-neon text-void font-display font-bold">3</span>
              <div>
                <p className="font-semibold">Connect above</p>
                <p className="mt-1 text-muted">
                  Your balances appear live from the chain. As milestones ship,
                  this is where you&apos;ll buy cover and stake — before anyone else.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}
