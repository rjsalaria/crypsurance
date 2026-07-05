"use client";

import { useEffect, useRef, useState } from "react";

const stages = [
  {
    title: "Covered event occurs",
    detail:
      "A flight is cancelled. In a traditional system you'd now start a weeks-long paper trail. Here, the event itself is the claim.",
    log: "event.detected — flight AA1042 cancelled",
  },
  {
    title: "Oracles verify the event",
    detail:
      "Multiple independent data oracles confirm the cancellation against airline and airport feeds. No adjuster's opinion — just data consensus.",
    log: "oracle.consensus — 5/5 sources confirm ✓",
  },
  {
    title: "Smart contract validates policy",
    detail:
      "The policy contract checks that your coverage was active, premiums paid, and the event matches the covered terms — all in one block.",
    log: "policy.check — active ✓ terms matched ✓",
  },
  {
    title: "Pool releases payout",
    detail:
      "The underwriting pool transfers the payout straight to your wallet. Total elapsed time: minutes. Paperwork filed: zero.",
    log: "payout.settled — 1,250 USDC → your wallet",
  },
];

export default function ClaimFlow() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setActive((a) => (a + 1) % stages.length);
    }, 3200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const select = (i: number) => {
    setPlaying(false);
    setActive(i);
  };

  return (
    <div className="glass-card ring-glow p-6 sm:p-10">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* steps */}
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li key={s.title}>
              <button
                onClick={() => select(i)}
                aria-current={i === active ? "step" : undefined}
                className={`w-full text-left rounded-2xl px-5 py-4 border transition-all duration-300 ${
                  i === active
                    ? "border-cyan-neon/70 bg-cyan-neon/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                    : "border-muted/15 hover:border-muted/40"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display font-bold text-sm ${
                      i === active
                        ? "bg-cyan-neon text-void pulse-ring"
                        : i < active
                          ? "bg-lime-neon/80 text-void"
                          : "bg-surface text-muted"
                    }`}
                  >
                    {i < active ? "✓" : i + 1}
                  </span>
                  <div>
                    <p className={`font-display font-bold ${i === active ? "text-ink" : "text-muted"}`}>
                      {s.title}
                    </p>
                    {i === active && (
                      <p className="mt-1.5 text-sm text-muted leading-relaxed animate-fade-up">
                        {s.detail}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>

        {/* fake terminal */}
        <div className="rounded-2xl bg-void/80 border border-muted/20 p-5 font-mono text-sm flex flex-col">
          <div className="flex items-center gap-1.5 pb-4 border-b border-muted/15">
            <span className="h-3 w-3 rounded-full bg-magenta-neon/70" />
            <span className="h-3 w-3 rounded-full bg-lime-neon/70" />
            <span className="h-3 w-3 rounded-full bg-cyan-neon/70" />
            <span className="ml-3 text-xs text-muted">crypsurance://claim-engine</span>
          </div>
          <div className="pt-4 space-y-3 flex-1">
            {stages.slice(0, active + 1).map((s, i) => (
              <p key={s.log} className={i === active ? "text-cyan-neon animate-fade-up" : "text-muted"}>
                <span className="text-violet-neon">›</span> {s.log}
              </p>
            ))}
            {active === stages.length - 1 && (
              <p className="text-lime-neon animate-fade-up font-bold">
                ✓ claim settled in 2m 14s — no humans were harmed by paperwork
              </p>
            )}
          </div>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="mt-4 self-start text-xs text-muted border border-muted/30 rounded-lg px-3 py-1.5 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors"
          >
            {playing ? "❚❚ Pause walkthrough" : "▶ Resume walkthrough"}
          </button>
        </div>
      </div>
    </div>
  );
}
