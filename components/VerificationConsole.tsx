"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { makeDevnetConnection } from "./chainClient";
import {
  fetchAllPolicies,
  type OnChainPolicy,
  type PolicyStatus,
} from "./protocolClient";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const shortId = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const statusMeta: Record<
  PolicyStatus,
  { label: string; cls: string; note: string }
> = {
  active: {
    label: "Cover active",
    cls: "bg-violet-neon/15 text-violet-neon",
    note: "Premium paid into the vault. No claim filed yet.",
  },
  requested: {
    label: "Claim requested",
    cls: "bg-cyan-neon/15 text-cyan-neon",
    note: "Waiting on the oracle's next run to check the flight data.",
  },
  escalated: {
    label: "Needs offline verification",
    cls: "bg-magenta-neon/10 text-magenta-neon border border-magenta-neon/40",
    note: "The data couldn't decide it — human verifiers, not a guess.",
  },
  paid: {
    label: "Claim paid ✓",
    cls: "bg-lime-neon/15 text-lime-neon",
    note: "The program sent the payout to the policy's own holder.",
  },
  denied: {
    label: "Claim denied",
    cls: "bg-magenta-neon/15 text-magenta-neon",
    note: "Assessed as no payout: the trigger wasn't met.",
  },
};

/**
 * The public record of the protocol, read from the Policy accounts the program
 * owns rather than from anything we store. Status is a field the program
 * writes, so this page reports state rather than inferring it from a feed of
 * events — a policy that settles is settled here, with no window to fall out of.
 */
export default function VerificationConsole() {
  const connection = useMemo(() => makeDevnetConnection(), []);
  const [policies, setPolicies] = useState<OnChainPolicy[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      setPolicies(await fetchAllPolicies(connection));
    } catch {
      setError("Devnet RPC is busy — try Refresh in a few seconds.");
    } finally {
      setScanning(false);
    }
  }, [connection]);

  useEffect(() => {
    scan();
  }, [scan]);

  const rows = policies ?? [];
  const openVerifications = rows.filter((p) => p.status === "escalated");
  const stats = {
    policies: rows.length,
    paid: rows.filter((p) => p.status === "paid").length,
    denied: rows.filter((p) => p.status === "denied").length,
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
            Every policy in the protocol and how it was settled — read directly
            from the program's own accounts. No database, no wallet needed, no
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
          { v: stats.policies, label: "Policies written" },
          { v: stats.paid, label: "Claims paid" },
          { v: stats.denied, label: "Claims denied" },
          { v: stats.open, label: "Awaiting offline verification" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-void/60 border border-muted/20 p-4 text-center">
            <p className="font-display text-2xl font-bold text-gradient">
              {policies === null ? "…" : s.v}
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
            {openVerifications.map((p) => (
              <li key={p.address} className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-cyan-neon">{shortId(p.address)}</span>
                <span className="font-mono">{p.flight} · {p.date}</span>
                <span className="text-muted text-xs">{p.basis || "no data returned"}</span>
                <a
                  href={`https://explorer.solana.com/address/${p.address}?cluster=devnet`}
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

      {/* policy ledger */}
      {error && <p className="mt-4 text-xs text-magenta-neon">⚠ {error}</p>}
      {policies === null || scanning ? (
        <p className="mt-5 text-sm text-muted">Reading policies from the blockchain…</p>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No policies have been written yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-130">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
                <th className="py-2.5 pr-4">State</th>
                <th className="py-2.5 pr-4">Policy</th>
                <th className="py-2.5 pr-4">Flight</th>
                <th className="py-2.5 pr-4">Holder</th>
                <th className="py-2.5">What the chain says</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.address} className="border-b border-muted/10 last:border-0">
                  <td className="py-3 pr-4 align-top">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusMeta[p.status].cls}`}>
                      {statusMeta[p.status].label}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-cyan-neon">
                    {shortId(p.address)}
                  </td>
                  <td className="py-3 pr-4 align-top font-mono whitespace-nowrap">
                    {p.flight} · {p.date}
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-xs text-muted">
                    {short(p.holder)}
                  </td>
                  <td className="py-3 align-top">
                    <div className="max-w-64">
                      <p className="text-[11px] text-muted leading-snug">
                        {statusMeta[p.status].note}
                      </p>
                      {/* the oracle's own recorded reason — the evidence, verbatim */}
                      {p.basis && (
                        <p className="mt-1 text-[10px] text-muted/70 font-mono break-words">
                          {p.basis}
                        </p>
                      )}
                      <a
                        href={`https://explorer.solana.com/address/${p.address}?cluster=devnet`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs text-cyan-neon hover:underline"
                      >
                        account →
                      </a>
                    </div>
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
