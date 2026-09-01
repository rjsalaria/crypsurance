"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { makeDevnetConnection } from "./chainClient";
import {
  fetchAllPolicies,
  fetchAttestations,
  fetchOperators,
  fetchRegistry,
  type OnChainAttestation,
  type OnChainOperator,
  type OnChainPolicy,
  type OnChainRegistry,
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
  const [attestations, setAttestations] = useState<OnChainAttestation[]>([]);
  const [operators, setOperators] = useState<OnChainOperator[]>([]);
  const [registry, setRegistry] = useState<OnChainRegistry | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      // The policy ledger is the page; the consensus detail is an enrichment.
      // Read them together but let the detail fail on its own, so a busy RPC
      // costs the expandable rows rather than the whole console.
      const [ledger, detail] = await Promise.all([
        fetchAllPolicies(connection),
        Promise.allSettled([
          fetchAttestations(connection),
          fetchOperators(connection),
          fetchRegistry(connection),
        ]),
      ]);
      setPolicies(ledger);
      const [atts, ops, reg] = detail;
      if (atts.status === "fulfilled") setAttestations(atts.value);
      if (ops.status === "fulfilled") setOperators(ops.value);
      if (reg.status === "fulfilled") setRegistry(reg.value);
    } catch {
      setError("Devnet RPC is busy — try Refresh in a few seconds.");
    } finally {
      setScanning(false);
    }
  }, [connection]);

  useEffect(() => {
    // scan() sets its "scanning" flag before awaiting the RPC — that render is
    // what puts the console into its loading state instead of showing an
    // empty table while the chain is read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    scan();
  }, [scan]);

  // Attestations name the Operator PDA, not a wallet. Join so the console can
  // show an address a reader can look up.
  const authorityOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of operators) m.set(o.address, o.authority);
    return m;
  }, [operators]);

  const byPolicy = useMemo(() => {
    const m = new Map<string, OnChainAttestation[]>();
    for (const a of attestations) {
      const list = m.get(a.policy) ?? [];
      list.push(a);
      m.set(a.policy, list);
    }
    // Stable order, so the same claim reads the same way on every refresh.
    for (const list of m.values())
      list.sort((x, y) => x.operator.localeCompare(y.operator));
    return m;
  }, [attestations]);

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
                <th className="py-2.5 pr-4">Verified by</th>
                <th className="py-2.5">What the chain says</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
              const all = byPolicy.get(p.address) ?? [];
              // created_at is zero on records written before commit-reveal
              // existed. The program refuses to judge them and they can never
              // be opened, so they are not "sealed" — counting them as pending
              // verdicts would promise something that is never coming.
              const atts = all.filter((a) => a.createdAt > 0);
              const legacy = all.length - atts.length;
              const revealed = atts.filter((a) => a.approved !== null);
              const sealed = atts.length - revealed.length;
              const agreed = revealed.filter((a) => a.approved === true).length;
              const expanded = open === p.address;
              return (
                <Fragment key={p.address}>
                <tr className="border-b border-muted/10">
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
                  <td className="py-3 pr-4 align-top">
                    {all.length === 0 ? (
                      <span className="text-[11px] text-muted/60">—</span>
                    ) : (
                      <button
                        onClick={() => setOpen(expanded ? null : p.address)}
                        className="text-left group"
                      >
                        {revealed.length === 0 ? (
                          // Nothing opened yet. Saying "0 of N agreed" here
                          // would report a disagreement that has not happened.
                          <span className="font-mono text-xs whitespace-nowrap text-cyan-neon">
                            {atts.length > 0
                              ? `${atts.length} sealed`
                              : "before commit–reveal"}
                          </span>
                        ) : (
                          <>
                            <span className="font-mono text-xs whitespace-nowrap">
                              <span className="text-lime-neon">{agreed}</span>
                              <span className="text-muted"> of </span>
                              <span>{revealed.length}</span>
                              <span className="text-muted"> agreed</span>
                            </span>
                            {sealed > 0 && (
                              <span className="ml-1.5 text-[10px] text-cyan-neon whitespace-nowrap">
                                · {sealed} sealed
                              </span>
                            )}
                          </>
                        )}
                        <span className="block text-[10px] text-muted/70 group-hover:text-cyan-neon transition-colors">
                          {expanded ? "hide" : "who said what"} {expanded ? "▴" : "▾"}
                        </span>
                      </button>
                    )}
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
                {expanded && (
                  <tr className="border-b border-muted/10 bg-void/40">
                    <td colSpan={6} className="px-4 py-4">
                      <p className="text-[11px] text-muted mb-3">
                        Each operator committed a sealed verdict, then opened it
                        after the window closed. Nobody could see another&apos;s
                        answer before committing.
                        {registry &&
                          ` ${registry.threshold} of ${registry.operatorCount} have to agree before a claim pays.`}
                        {legacy > 0 &&
                          " Records marked before commit–reveal predate this mechanism; the program will not judge them."}
                      </p>
                      <div className="space-y-2">
                        {all.map((a) => {
                          const isLegacy = a.createdAt === 0;
                          const who = authorityOf.get(a.operator);
                          return (
                            <div
                              key={a.address}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                            >
                              <span className="font-mono text-muted w-28 shrink-0">
                                {who ? short(who) : short(a.operator)}
                              </span>
                              {isLegacy ? (
                                <span className="px-2 py-0.5 rounded-full bg-muted/15 text-muted font-semibold">
                                  written before commit–reveal
                                </span>
                              ) : a.approved === null ? (
                                <span className="px-2 py-0.5 rounded-full bg-cyan-neon/15 text-cyan-neon font-semibold">
                                  sealed — not yet opened
                                </span>
                              ) : a.approved ? (
                                <span className="px-2 py-0.5 rounded-full bg-lime-neon/15 text-lime-neon font-semibold">
                                  pay
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-magenta-neon/15 text-magenta-neon font-semibold">
                                  deny
                                </span>
                              )}
                              {a.resolved && (
                                <span className="text-[10px] text-muted/70">
                                  judged against the outcome
                                </span>
                              )}
                              {a.basis && (
                                <span className="font-mono text-[10px] text-muted/70 break-all">
                                  {a.basis}
                                </span>
                              )}
                              <a
                                href={`https://explorer.solana.com/address/${a.address}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-neon hover:underline ml-auto"
                              >
                                attestation →
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
