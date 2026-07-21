"use client";

import { useEffect, useState } from "react";

// The oracle runs on a 15-minute schedule (GitHub Actions cron every 15 min).
const WINDOW_MS = 15 * 60 * 1000;

function useOracleClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const intoWindow = now % WINDOW_MS;
  const msRemaining = WINDOW_MS - intoWindow;
  const secondsRemaining = msRemaining / 1000;
  const fractionRemaining = msRemaining / WINDOW_MS;
  // the scheduled run fires at each boundary — show a sync burst just after
  const syncing = intoWindow < 6000;

  return { secondsRemaining, fractionRemaining, syncing };
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

export default function OracleCountdown() {
  const { secondsRemaining, fractionRemaining, syncing } = useOracleClock();
  const mm = pad(secondsRemaining / 60);
  const ss = pad(secondsRemaining % 60);

  const R = 92;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - fractionRemaining);

  return (
    <div className="relative glass-card ring-glow overflow-hidden p-6 sm:p-8">
      {/* grid + scanline atmosphere */}
      <div className="absolute inset-0 grid-overlay opacity-60" aria-hidden="true" />
      <div className="oracle-scanline" aria-hidden="true" />

      <div className="relative grid gap-8 md:grid-cols-[220px_1fr] items-center">
        {/* radial countdown */}
        <div className="relative mx-auto h-56 w-56">
          {/* rotating decorative rings */}
          <svg viewBox="0 0 220 220" className="oracle-ring-a absolute inset-0">
            <circle
              cx="110" cy="110" r="104" fill="none"
              stroke="rgba(139,92,246,0.25)" strokeWidth="1"
              strokeDasharray="2 10"
            />
          </svg>
          <svg viewBox="0 0 220 220" className="oracle-ring-b absolute inset-0">
            <circle
              cx="110" cy="110" r="72" fill="none"
              stroke="rgba(34,211,238,0.2)" strokeWidth="1"
              strokeDasharray="1 14"
            />
          </svg>

          {/* progress ring */}
          <svg viewBox="0 0 220 220" className="absolute inset-0 -rotate-90">
            <defs>
              <linearGradient id="oc-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22d3ee" />
                <stop offset="0.5" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#e879f9" />
              </linearGradient>
            </defs>
            <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(168,159,208,0.12)" strokeWidth="6" />
            <circle
              cx="110" cy="110" r={R} fill="none"
              stroke="url(#oc-grad)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.7))", transition: "stroke-dashoffset 0.2s linear" }}
            />
          </svg>

          {/* center readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {syncing ? (
              <>
                <span className="font-display text-2xl font-bold text-lime-neon oracle-flicker">
                  SYNCING
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted">
                  querying feeds
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-5xl font-bold tabular-nums text-ink" style={{ textShadow: "0 0 18px rgba(139,92,246,0.6)" }}>
                  {mm}:{ss}
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-cyan-neon">
                  next sync
                </span>
              </>
            )}
          </div>
        </div>

        {/* telemetry */}
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${syncing ? "bg-lime-neon" : "bg-cyan-neon"} oracle-flicker`} />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-neon">
              Autonomous Oracle · {syncing ? "running" : "online"}
            </span>
          </div>
          <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold">
            The oracle never sleeps.
          </h2>
          <p className="mt-2 text-sm text-muted max-w-lg leading-relaxed">
            A scheduled agent wakes every 15 minutes, pulls the latest event
            data, and settles every pending claim on-chain — pay, deny, or
            escalate to human verification. No one has to press a button.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-w-md">
            {[
              { k: "Cycle interval", v: "15:00" },
              { k: "Network", v: "Solana devnet" },
              { k: "Verification", v: "Multi-source" },
              { k: "On no data", v: "→ human network" },
            ].map((r) => (
              <div key={r.k} className="flex items-center justify-between border-b border-muted/10 pb-1.5">
                <dt className="text-[11px] uppercase tracking-wider text-muted">{r.k}</dt>
                <dd className="font-mono text-cyan-neon">{r.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
