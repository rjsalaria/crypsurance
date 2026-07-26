"use client";

import { useState } from "react";

/**
 * URL of the deployed faucet Worker (see faucet-worker/README.md).
 * Until it's set, the card shows a "coming online" note instead of a broken
 * request — so the page is never broken if this ships before the Worker.
 */
const FAUCET_ENDPOINT = "https://crypsurance-faucet.surety-faucet.workers.dev";
const FAUCET_CONFIGURED = !FAUCET_ENDPOINT.includes("REPLACE");

// Loose base58 sanity check (real validation happens in the Worker).
const looksLikeAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

type State = "idle" | "sending" | "done" | "error";

export default function Faucet() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  const trimmed = address.trim();
  const valid = looksLikeAddress(trimmed);

  async function request() {
    if (!valid || !FAUCET_CONFIGURED) return;
    setState("sending");
    setMessage("");
    setSignature("");
    try {
      const res = await fetch(FAUCET_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });
      const data = (await res.json()) as {
        signature?: string;
        amount?: number;
        confirmed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setState("error");
        setMessage(data.error || "Request failed — try again in a moment.");
        return;
      }
      setSignature(data.signature ?? "");
      setState("done");
      setMessage(
        `Sent ${(data.amount ?? 0).toLocaleString("en-US")} SURETY${
          data.confirmed ? "" : " — confirming on-chain…"
        }`
      );
    } catch {
      setState("error");
      setMessage("Couldn't reach the faucet. Please try again shortly.");
    }
  }

  return (
    <div className="glass-card p-6 sm:p-8" id="faucet">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-neon/40 bg-cyan-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-neon">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-neon animate-pulse" />
            SURETY devnet faucet
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold">
            Get test SURETY, free
          </h2>
          <p className="mt-1 text-sm text-muted max-w-xl">
            Paste your <b>devnet</b> Solana wallet address and we&apos;ll send you
            SURETY to test with — buy cover, file claims, break things. Play
            money, no value, devnet only.
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-2xl">
        <label htmlFor="faucet-addr" className="text-sm font-semibold">
          Your devnet wallet address
        </label>
        <div className="mt-2 flex flex-col sm:flex-row gap-3">
          <input
            id="faucet-addr"
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (state !== "idle") setState("idle");
            }}
            placeholder="e.g. 9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 rounded-xl bg-void/70 border border-muted/25 px-3 py-2.5 font-mono text-sm focus:border-cyan-neon focus:outline-none"
          />
          <button
            onClick={request}
            disabled={!valid || state === "sending" || !FAUCET_CONFIGURED}
            className="btn-gradient px-6 py-3 rounded-xl font-display font-bold text-white whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {state === "sending" ? "Sending…" : "Request SURETY"}
          </button>
        </div>

        {!FAUCET_CONFIGURED ? (
          <p className="mt-3 text-xs text-muted">
            ⚙ The faucet is being brought online — check back shortly.
          </p>
        ) : trimmed && !valid ? (
          <p className="mt-3 text-xs text-magenta-neon">
            That doesn&apos;t look like a valid Solana address yet.
          </p>
        ) : null}

        {state === "error" && (
          <p className="mt-3 text-sm text-magenta-neon">⚠ {message}</p>
        )}

        {state === "done" && (
          <div className="mt-4 rounded-xl border border-lime-neon/30 bg-lime-neon/5 px-4 py-3">
            <p className="text-sm text-lime-neon font-semibold">✓ {message}</p>
            {signature && (
              <a
                href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-cyan-neon hover:underline font-mono break-all"
              >
                View the transfer on Solana Explorer →
              </a>
            )}
            <p className="mt-2 text-[10px] text-muted">
              It may take a few seconds to land. Refresh your balance in the
              wallet panel above.
            </p>
          </div>
        )}

        <p className="mt-5 text-[10px] text-muted">
          One drip per wallet every few hours. Need devnet SOL for fees too? Use{" "}
          <a
            href="https://faucet.quicknode.com/solana/devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-neon hover:underline"
          >
            faucet.quicknode.com/solana/devnet
          </a>
          .
        </p>
      </div>
    </div>
  );
}
