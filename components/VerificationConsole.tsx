"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
const POOL_WALLET = new PublicKey(
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy"
);

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

type EventRow = {
  kind: "policy" | "claim-request" | "claim-paid" | "claim-denied" | "verify-request";
  policy: string;
  flight?: string;
  date?: string;
  payout?: number;
  basis?: string;
  reason?: string;
  holder?: string;
  signature: string;
  time: number | null;
};

const kindMeta: Record<EventRow["kind"], { label: string; cls: string }> = {
  policy: { label: "Cover bought", cls: "bg-violet-neon/15 text-violet-neon" },
  "claim-request": { label: "Claim requested", cls: "bg-cyan-neon/15 text-cyan-neon" },
  "claim-paid": { label: "Claim paid ✓", cls: "bg-lime-neon/15 text-lime-neon" },
  "claim-denied": { label: "Claim denied", cls: "bg-magenta-neon/15 text-magenta-neon" },
  "verify-request": { label: "Needs offline verification", cls: "bg-magenta-neon/10 text-magenta-neon border border-magenta-neon/40" },
};

export default function VerificationConsole() {
  const connection = useMemo(
    () => new Connection(clusterApiUrl("devnet"), "confirmed"),
    []
  );
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      const poolAta = await getAssociatedTokenAddress(SURETY_MINT, POOL_WALLET);
      const sigs = await connection.getSignaturesForAddress(poolAta, { limit: 40 });
      const txs: Awaited<ReturnType<typeof connection.getParsedTransactions>> = [];
      for (let i = 0; i < sigs.length; i += 20) {
        const chunk = await connection.getParsedTransactions(
          sigs.slice(i, i + 20).map((s) => s.signature),
          { maxSupportedTransactionVersion: 0 }
        );
        txs.push(...chunk);
      }
      const rows: EventRow[] = [];
      txs.forEach((tx, i) => {
        if (!tx) return;
        for (const ix of tx.transaction.message.instructions) {
          if (!("program" in ix) || ix.program !== "spl-memo") continue;
          try {
            const m = JSON.parse(ix.parsed as string);
            if (!m.kind) continue;
            const kind = (m.kind === "policy" ? "policy" : m.kind) as EventRow["kind"];
            if (!(kind in kindMeta)) continue;
            rows.push({
              kind,
              policy: m.id ?? m.policy ?? "—",
              flight: m.flight,
              date: m.date,
              payout: m.payout,
              basis: m.basis,
              reason: m.reason,
              holder: m.holder,
              signature: sigs[i]?.signature ?? "",
              time: tx.blockTime ?? null,
            });
          } catch {
            /* non-JSON memo */
          }
        }
      });
      setEvents(rows);
    } catch {
      setError("Devnet RPC is busy — try Refresh in a few seconds.");
    } finally {
      setScanning(false);
    }
  }, [connection]);

  useEffect(() => {
    scan();
  }, [scan]);

  const settledIds = new Set(
    (events ?? [])
      .filter((e) => e.kind === "claim-paid" || e.kind === "claim-denied")
      .map((e) => e.policy)
  );
  const openVerifications = (events ?? []).filter(
    (e) => e.kind === "verify-request" && !settledIds.has(e.policy)
  );
  const stats = {
    policies: (events ?? []).filter((e) => e.kind === "policy").length,
    paid: (events ?? []).filter((e) => e.kind === "claim-paid").length,
    denied: (events ?? []).filter((e) => e.kind === "claim-denied").length,
    open: openVerifications.length,
  };

  return (
    <div className="glass-card ring-glow p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-lime-neon/40 bg-lime-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-lime-neon">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-neon animate-pulse" />
            Reading live from Solana devnet
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold">
            Verification console
          </h2>
          <p className="mt-1 text-sm text-muted max-w-2xl">
            Every policy, claim and verification event in the protocol — read
            directly from the blockchain. No database, no wallet needed, no
            trust required.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 rounded-lg border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors disabled:opacity-50"
        >
          {scanning ? "Scanning chain…" : "↻ Refresh"}
        </button>
      </div>

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { v: stats.policies, label: "Policies (recent)" },
          { v: stats.paid, label: "Claims paid" },
          { v: stats.denied, label: "Claims denied" },
          { v: stats.open, label: "Awaiting offline verification" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-void/60 border border-muted/20 p-4 text-center">
            <p className="font-display text-2xl font-bold text-gradient">
              {events === null ? "…" : s.v}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* open verification requests */}
      {openVerifications.length > 0 && (
        <div className="mt-6 rounded-2xl border border-magenta-neon/40 bg-magenta-neon/5 p-5">
          <h3 className="font-display font-bold text-magenta-neon">
            Open verification requests — partner / community input needed
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {openVerifications.map((e) => (
              <li key={e.signature} className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-cyan-neon">{e.policy}</span>
                <span className="font-mono">{e.flight} · {e.date}</span>
                <span className="text-muted text-xs">{e.reason}</span>
                <a
                  href={`https://explorer.solana.com/tx/${e.signature}?cluster=devnet`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-cyan-neon hover:underline"
                >
                  on-chain →
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* event feed */}
      {error && <p className="mt-4 text-xs text-magenta-neon">⚠ {error}</p>}
      {events === null || scanning ? (
        <p className="mt-5 text-sm text-muted">Reading events from the blockchain…</p>
      ) : events.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No protocol events in the recent window.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-130">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
                <th className="py-2.5 pr-4">Event</th>
                <th className="py-2.5 pr-4">Policy</th>
                <th className="py-2.5 pr-4">Flight</th>
                <th className="py-2.5 pr-4">Basis / holder</th>
                <th className="py-2.5">Proof</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.signature}-${i}`} className="border-b border-muted/10 last:border-0">
                  <td className="py-3 pr-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${kindMeta[e.kind].cls}`}>
                      {kindMeta[e.kind].label}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-cyan-neon">{e.policy}</td>
                  <td className="py-3 pr-4 font-mono">
                    {e.flight ? `${e.flight}${e.date ? " · " + e.date : ""}` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted">
                    {e.basis ?? e.reason ?? (e.holder ? short(e.holder) : "—")}
                  </td>
                  <td className="py-3">
                    <a
                      href={`https://explorer.solana.com/tx/${e.signature}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-cyan-neon hover:underline"
                    >
                      tx →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
