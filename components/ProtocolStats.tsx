"use client";

import { useEffect, useMemo, useState } from "react";
import { makeDevnetConnection } from "./chainClient";
import { fetchAllPolicies } from "./protocolClient";

/** Team wallets, excluded from the KPI so our own testing can't inflate it. */
const TEAM = new Set([
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy", // treasury / oracle
  "7SEo9AVxa7gHYHvDXq9a2Zpj5MgDWK1eX5XhH6mUuxBD", // deploy authority
]);

type Stats = {
  policies: number;
  settled: number;
  autonomousPct: number | null;
  wallets: number;
  payout: number;
};

/**
 * Live protocol activity, read straight off the chain.
 *
 * Every number comes from Policy accounts the program owns, so a visitor can
 * verify it rather than take our word for it — status is a field the program
 * writes, not something this page infers. It also keeps the KPI (distinct
 * wallets that completed a claim) visible so it can't be quietly forgotten.
 */
export default function ProtocolStats() {
  const connection = useMemo(() => makeDevnetConnection(), []);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const policies = await fetchAllPolicies(connection);

        const settledStates = ["paid", "denied"] as const;
        const settled = policies.filter((p) =>
          settledStates.includes(p.status as (typeof settledStates)[number])
        );
        const escalated = policies.filter((p) => p.status === "escalated");
        const payout = policies
          .filter((p) => p.status === "paid")
          .reduce((n, p) => n + p.payout, 0);

        if (!cancelled) {
          setStats({
            policies: policies.length,
            settled: settled.length,
            // share of assessed claims the oracle resolved without a human
            autonomousPct:
              settled.length + escalated.length > 0
                ? Math.round(
                    (settled.length / (settled.length + escalated.length)) * 100
                  )
                : null,
            wallets: new Set(
              settled.map((p) => p.holder).filter((h) => !TEAM.has(h))
            ).size,
            payout,
          });
        }
      } catch {
        /* chain unreachable — the strip simply stays in its loading state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const cells: { label: string; value: string }[] = [
    { label: "Policies written", value: stats ? String(stats.policies) : "—" },
    { label: "Claims settled", value: stats ? String(stats.settled) : "—" },
    {
      label: "Settled without a human",
      value: stats?.autonomousPct !== null && stats ? `${stats.autonomousPct}%` : "—",
    },
    {
      label: "SURETY paid out",
      value: stats ? stats.payout.toLocaleString("en-US") : "—",
    },
    // the KPI: outside wallets that saw a claim through, team excluded
    { label: "Wallets served", value: stats ? String(stats.wallets) : "—" },
  ];

  return (
    <div className="glass-card px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-neon">
          Live protocol activity · read from Solana devnet
        </p>
        <a
          href="https://explorer.solana.com/address/4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted hover:text-cyan-neon transition-colors"
        >
          verify on explorer →
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
        {cells.map((c) => (
          <div key={c.label}>
            <dd className="font-display text-2xl sm:text-3xl font-bold text-gradient tabular-nums">
              {c.value}
            </dd>
            <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">
              {c.label}
            </dt>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[11px] text-muted">
        Every figure is read from the program's own policy accounts — nothing
        here is self-reported, and our own wallets are excluded from “wallets
        served”. Devnet: play money, real mechanics.
      </p>
    </div>
  );
}
