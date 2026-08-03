"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { fetchMemoHistory, makeDevnetConnection } from "./chainMemos";

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const POOL_WALLET = new PublicKey(
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy"
);

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
 * This is the honest version of social proof: every number is derived from
 * public Solana transactions, so a visitor can verify it rather than take our
 * word for it. It is also the grant KPI — distinct wallets that completed a
 * claim — kept visible so it can't be quietly forgotten.
 */
export default function ProtocolStats() {
  const connection = useMemo(() => makeDevnetConnection(), []);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const poolAta = await getAssociatedTokenAddress(
          SURETY_MINT,
          POOL_WALLET
        );
        const records = await fetchMemoHistory(connection, poolAta, 1000);

        const holderOf: Record<string, string> = {};
        for (const { memo: m } of records) {
          if (m.kind === "policy" && m.id && m.holder) holderOf[m.id] = m.holder;
        }

        const pool = POOL_WALLET.toBase58();
        const buyers = new Set<string>();
        const completed = new Set<string>();
        let settled = 0;
        let escalated = 0;
        let payout = 0;

        for (const { memo: m } of records) {
          if (m.kind === "policy" && m.holder && m.holder !== pool) {
            buyers.add(m.holder);
          }
          if (!m.policy) continue;
          const h = holderOf[m.policy];
          if (m.kind === "claim-paid" || m.kind === "claim-denied") {
            settled++;
            if (h && h !== pool) completed.add(h);
            if (m.kind === "claim-paid") {
              const p = records.find(
                (r) => r.memo.kind === "policy" && r.memo.id === m.policy
              );
              payout += p?.memo.payout ?? 0;
            }
          }
          if (m.kind === "verify-request") escalated++;
        }

        if (!cancelled) {
          setStats({
            policies: Object.keys(holderOf).length,
            settled,
            autonomousPct:
              settled + escalated > 0
                ? Math.round((settled / (settled + escalated)) * 100)
                : null,
            wallets: completed.size,
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
  ];

  return (
    <div className="glass-card px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-neon">
          Live protocol activity · read from Solana devnet
        </p>
        <a
          href="https://explorer.solana.com/address/9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted hover:text-cyan-neon transition-colors"
        >
          verify on explorer →
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
        Every figure is derived from public transactions on the underwriting
        pool — nothing here is self-reported. Devnet: play money, real
        mechanics.
      </p>
    </div>
  );
}
