"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import "@solana/wallet-adapter-react-ui/styles.css";
import PolicyCertificate from "./PolicyCertificate";
import {
  confirmSignature,
  DEVNET_RPC,
  devnetFetch,
  withWalletTimeout,
} from "./chainClient";
import { buyCoverIx, fetchPolicies, fileClaimIx, policyPda } from "./protocolClient";
import { FUNDED_EVENT } from "./events";

/** The real SURETY devnet mint created by solana/create-token.js. */
const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
// Shown as a preview only — the program recomputes the premium from the
// payout, so this cannot be used to underpay.
const PREMIUM_RATE = 0.024; // travel-delay parametric, 2.4% of payout

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const fmt = (n: number) => n.toLocaleString("en-US");
/** Policy ids are account addresses now, so show them the way chains do. */
const shortId = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/* ------------------------------------------------------------------ */
/* balances                                                            */
/* ------------------------------------------------------------------ */

function useBalances(refreshKey: number) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [surety, setSurety] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // These balances change without anyone touching this component: the faucet
  // credits SURETY, and the oracle pays claims straight into the wallet. Until
  // this existed the only way to see either was to disconnect and reconnect,
  // which is a bug report waiting to happen and looked broken on camera.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const timers: number[] = [];
    const onFunded = () => {
      bump();
      // the drip may still be confirming when the worker replies
      timers.push(window.setTimeout(bump, 5_000));
    };
    window.addEventListener(FUNDED_EVENT, onFunded);
    const poll = window.setInterval(bump, 20_000);
    return () => {
      window.removeEventListener(FUNDED_EVENT, onFunded);
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    // No wallet, nothing to read. Disconnecting is handled where these are
    // returned — clearing state here would just queue an extra render.
    if (!publicKey) return;
    let cancelled = false;
    // The one render this costs is the point: it's what shows the spinner
    // before the RPC round-trip, which on devnet is not fast.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: SURETY_MINT }
        );
        const suretyAmount = tokenAccounts.value.reduce(
          (sum, acc) =>
            sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
          0
        );
        if (!cancelled) {
          setSol(lamports / LAMPORTS_PER_SOL);
          setSurety(suretyAmount);
        }
      } catch {
        if (!cancelled) {
          setSol(null);
          setSurety(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection, refreshKey, tick]);

  // A disconnected wallet has no balances, rather than the last one's.
  return {
    sol: publicKey ? sol : null,
    surety: publicKey ? surety : null,
    loading,
  };
}

/* ------------------------------------------------------------------ */
/* buy cover — creates an on-chain Policy account via the program      */
/* ------------------------------------------------------------------ */

type Purchase = {
  policyId: string;
  payout: number;
  premium: number;
  signature: string;
  holder: string;
  flight: string;
  date: string;
};

function BuyCover({
  suretyBalance,
  onPurchased,
}: {
  suretyBalance: number | null;
  onPurchased: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [payout, setPayout] = useState(10000);
  const [flight, setFlight] = useState("TEST-DELAY");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purchase, setPurchase] = useState<Purchase | null>(null);

  const premium = Math.max(1, Math.round(payout * PREMIUM_RATE));
  const insufficient = suretyBalance !== null && suretyBalance < premium;
  const flightOk = /^[A-Z0-9-]{3,12}$/.test(flight);

  const buy = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      // One instruction to the protocol program: it creates the policy
      // account and moves the premium into the program-owned vault itself.
      // The premium is recomputed on-chain from the payout, so what the UI
      // shows is a preview, not an input the program trusts.
      const nonce = BigInt(Date.now());
      // Derived synchronously on purpose. Awaiting anything between the click
      // and sendTransaction ends the browser's user-activation window, and
      // Phantom's approval popup is then suppressed — the button appears to do
      // nothing. The async form of this call returns a promise for what is
      // pure address arithmetic, so awaiting it bought nothing and cost the
      // prompt. Keep every await in this function *after* sendTransaction.
      const holderToken = getAssociatedTokenAddressSync(SURETY_MINT, publicKey);
      const policyAddress = policyPda(publicKey, nonce);

      const tx = new Transaction().add(
        buyCoverIx({
          holder: publicKey,
          holderToken,
          nonce,
          flight,
          date,
          payout,
        })
      );

      const signature = await withWalletTimeout(sendTransaction(tx, connection));
      // Poll for status instead of confirming against a pre-approval blockhash,
      // which expires while the user is in their wallet and falsely reports
      // failure for transactions that landed.
      await confirmSignature(connection, signature);

      setPurchase({
        policyId: policyAddress.toBase58(),
        payout,
        premium,
        signature,
        holder: publicKey.toBase58(),
        flight,
        date,
      });
      onPurchased();
    } catch (e) {
      setError(
        e instanceof Error ? e.message.slice(0, 140) : "Transaction failed"
      );
    } finally {
      setBusy(false);
    }
  }, [publicKey, payout, premium, flight, date, connection, sendTransaction, onPurchased]);

  if (!connected) return null;

  return (
    <div className="mt-8 border-t border-muted/15 pt-6">
      <h3 className="font-display text-xl font-bold">
        Buy real cover on devnet{" "}
        <span className="ml-2 align-middle rounded-full border border-lime-neon/40 bg-lime-neon/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-lime-neon">
          M2 · on-chain
        </span>
      </h3>
      <p className="mt-1 text-sm text-muted max-w-xl">
        Travel-delay parametric cover. Your policy becomes an account owned by
        the protocol program, and your premium moves into a vault the program
        alone controls — no private key can spend it, ours included. The premium
        is calculated on-chain, and a settled claim always pays the policy&apos;s
        own holder.
      </p>

      {!purchase ? (
        <div className="mt-5 grid gap-6 md:grid-cols-2 max-w-3xl">
          <div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label htmlFor="ld-flight" className="text-sm font-semibold">
                  Flight number
                </label>
                <input
                  id="ld-flight"
                  type="text"
                  value={flight}
                  onChange={(e) => setFlight(e.target.value.toUpperCase().trim())}
                  placeholder="e.g. AI302"
                  className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-3 py-2.5 font-mono text-sm focus:border-cyan-neon focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ld-date" className="text-sm font-semibold">
                  Flight date
                </label>
                <input
                  id="ld-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-void/70 border border-muted/25 px-3 py-2.5 font-mono text-sm focus:border-cyan-neon focus:outline-none"
                />
              </div>
              <p className="col-span-2 text-[10px] text-muted">
                Testnet tip: flight <b className="text-lime-neon">TEST-DELAY</b>{" "}
                always verifies as delayed (instant claim payout);{" "}
                <b>TEST-ONTIME</b> is always denied. Real flight numbers are
                checked against live flight data.
              </p>
              {!flightOk && (
                <p className="col-span-2 text-xs text-magenta-neon">
                  Enter a flight number (letters, numbers, dashes).
                </p>
              )}
            </div>
            <label htmlFor="ld-payout" className="text-sm font-semibold">
              Payout if flight delayed 3+ hrs:{" "}
              <span className="font-mono text-cyan-neon">{fmt(payout)} SURETY</span>
            </label>
            <input
              id="ld-payout"
              type="range"
              min={1000}
              max={50000}
              step={1000}
              value={payout}
              onChange={(e) => setPayout(Number(e.target.value))}
              className="mt-3 w-full accent-violet-500"
            />
            <p className="mt-3 text-sm">
              Premium:{" "}
              <b className="font-mono text-gradient">{fmt(premium)} SURETY</b>
              <span className="text-muted"> (2.4%, one-time)</span>
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            {insufficient && (
              <p className="text-xs text-magenta-neon">
                Not enough SURETY — your balance is {fmt(suretyBalance ?? 0)}.
              </p>
            )}
            {error && <p className="text-xs text-magenta-neon">⚠ {error}</p>}
            <button
              onClick={buy}
              disabled={busy || insufficient || !flightOk}
              className="btn-gradient px-6 py-3 rounded-xl font-display font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {busy ? "Waiting for wallet…" : `Buy cover — pay ${fmt(premium)} SURETY`}
            </button>
            <p className="text-[10px] text-muted">
              Phantom will ask you to approve. Devnet only — play money.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 max-w-2xl rounded-2xl p-[2px] bg-gradient-to-br from-cyan-neon via-violet-neon to-magenta-neon animate-fade-up">
          <div className="rounded-2xl bg-void/95 p-6">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-muted/20">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
                  CrypSurance · Devnet
                </p>
                <h4 className="font-display text-lg font-bold mt-1">
                  On-Chain Cover Certificate
                </h4>
              </div>
              <span className="shrink-0 rounded-full border-2 border-lime-neon/70 text-lime-neon text-[10px] font-bold uppercase tracking-widest px-3 py-1 rotate-6">
                Active
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Policy account</dt>
                {/* the full 44-char address overflows into the next column */}
                <dd
                  className="font-mono text-cyan-neon mt-0.5"
                  title={purchase.policyId}
                >
                  {shortId(purchase.policyId)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Product</dt>
                <dd className="mt-0.5 font-semibold">Travel Delay (parametric)</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Flight</dt>
                <dd className="mt-0.5 font-mono">{purchase.flight} · {purchase.date}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Payout</dt>
                <dd className="mt-0.5 font-display font-bold text-gradient">
                  {fmt(purchase.payout)} SURETY
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Premium paid</dt>
                <dd className="mt-0.5 font-mono">{fmt(purchase.premium)} SURETY</dd>
              </div>
            </dl>
            <a
              href={`https://explorer.solana.com/tx/${purchase.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-neon hover:underline font-mono break-all"
            >
              View the purchase transaction on Solana Explorer →
            </a>
            <div className="mt-4">
              <button
                onClick={() => setPurchase(null)}
                className="text-xs px-4 py-2 rounded-lg border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors"
              >
                ↻ Buy another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* my policies + claims (scanned from the chain)                       */
/* ------------------------------------------------------------------ */

type PolicyRow = {
  /** The policy's on-chain account address. */
  id: string;
  flight: string;
  date: string;
  payout: number;
  premium: number;
  status: "active" | "requested" | "manual" | "paid" | "denied";
  /** Why the oracle decided as it did, recorded on the policy account. */
  basis?: string;
  paidSig?: string;
  buySig?: string;
};

function MyPolicies({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [certRow, setCertRow] = useState<PolicyRow | null>(null);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setScanning(true);
    setError("");
    try {
      // One filtered query returns this wallet's policies as structured
      // accounts. No memo replay, no reconstructing status from a stream of
      // events — the status IS a field, written by the program.
      const policies = await fetchPolicies(connection, publicKey);

      setRows(
        policies.map((p) => ({
          id: p.address,
          flight: p.flight,
          date: p.date,
          payout: p.payout,
          premium: p.premium,
          // "manual" is this UI's label for the program's `escalated`
          status: p.status === "escalated" ? "manual" : p.status,
          basis: p.basis,
        }))
      );
    } catch (e) {
      // Surface the real reason — "RPC busy" hid genuine bugs before.
      const raw = e instanceof Error ? e.message : String(e);
      const throttled = /429|Too many requests|rate/i.test(raw);
      setError(
        throttled
          ? "Solana's public devnet RPC is rate-limiting this network — wait ~30s and hit Refresh."
          : `Could not read the chain: ${raw.slice(0, 140)}`
      );
      console.error("[CrypSurance] policy scan failed:", e);
    } finally {
      setScanning(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    // Nothing to scan while disconnected, and nothing to clear either: the
    // whole section renders null in that state (see the guard below).
    // scan() raises its own "scanning" flag first, hence the exemption.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected) scan();
  }, [connected, refreshKey, scan]);

  const requestClaim = useCallback(
    async (row: PolicyRow) => {
      if (!publicKey) return;
      setBusyId(row.id);
      setError("");
      try {
        // The program checks that the signer owns this policy and that it is
        // still claimable, so the UI doesn't have to be trusted about either.
        const tx = new Transaction().add(
          fileClaimIx(publicKey, new PublicKey(row.id))
        );
        const signature = await withWalletTimeout(
          sendTransaction(tx, connection)
        );
        await confirmSignature(connection, signature);
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 120) : "Claim request failed");
      } finally {
        setBusyId("");
      }
    },
    [publicKey, connection, sendTransaction, onChanged]
  );

  if (!connected) return null;

  const statusChip: Record<PolicyRow["status"], { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-lime-neon/15 text-lime-neon" },
    requested: { label: "Claim pending", cls: "bg-cyan-neon/15 text-cyan-neon" },
    manual: { label: "Offline verification", cls: "bg-violet-neon/15 text-violet-neon" },
    paid: { label: "Paid ✓", cls: "bg-cyan-neon/15 text-cyan-neon" },
    denied: { label: "Denied", cls: "bg-magenta-neon/15 text-magenta-neon" },
  };

  return (
    <div className="mt-8 border-t border-muted/15 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold">Your on-chain policies</h3>
        <button
          onClick={scan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 rounded-lg border border-muted/30 hover:border-cyan-neon/60 hover:text-cyan-neon transition-colors disabled:opacity-50"
        >
          {scanning ? "Scanning chain…" : "↻ Refresh"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-magenta-neon">⚠ {error}</p>}
      {rows === null || scanning ? (
        <p className="mt-3 text-sm text-muted">Reading policies from the blockchain…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No policies found for this wallet (recent purchases only — the scan
          covers the latest pool activity).
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-130">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-muted/15">
                <th className="py-2.5 pr-4">Policy</th>
                <th className="py-2.5 pr-4">Flight</th>
                <th className="py-2.5 pr-4">Payout</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-muted/10 last:border-0">
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => setCertRow(r)}
                      title="View policy certificate"
                      className="font-mono text-cyan-neon hover:underline underline-offset-2 decoration-dotted inline-flex items-center gap-1"
                    >
                      {shortId(r.id)}
                      <span className="text-[10px] opacity-70">▣</span>
                    </button>
                  </td>
                  <td className="py-3 pr-4 font-mono">{r.flight} · {r.date}</td>
                  <td className="py-3 pr-4 font-mono">{fmt(r.payout)}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusChip[r.status].cls}`}>
                      {statusChip[r.status].label}
                    </span>
                  </td>
                  <td className="py-3">
                    {r.status === "active" ? (
                      <>
                        <button
                          onClick={() => requestClaim(r)}
                          disabled={busyId === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-cyan-neon/50 text-cyan-neon hover:bg-cyan-neon/10 transition-colors disabled:opacity-50"
                        >
                          {busyId === r.id ? "Sending…" : "Request claim"}
                        </button>
                        <p className="mt-1.5 text-[11px] text-muted max-w-56 leading-snug">
                          Covered. File a claim if this flight is delayed 3+ hours.
                        </p>
                      </>
                    ) : (
                      <div className="max-w-56">
                        <p className="text-[11px] text-muted leading-snug">
                          {r.status === "requested" &&
                            "Checking the flight data. The oracle settles this on its next run — usually within 30 minutes."}
                          {r.status === "manual" &&
                            "The data couldn't decide it, so it's with human verifiers rather than being guessed."}
                          {r.status === "paid" &&
                            `Settled — ${fmt(r.payout)} SURETY was sent to your wallet by the program.`}
                          {r.status === "denied" &&
                            "Settled as no payout: the delay didn't reach the 3-hour trigger."}
                        </p>
                        {/* the oracle's own recorded reason — the evidence, verbatim */}
                        {r.basis && (
                          <p className="mt-1 text-[10px] text-muted/70 font-mono break-words">
                            {r.basis}
                          </p>
                        )}
                        <a
                          href={
                            r.status === "manual"
                              ? "https://network.crypsurance.io"
                              : `https://explorer.solana.com/address/${r.id}?cluster=devnet`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-block text-xs text-cyan-neon hover:underline"
                        >
                          {r.status === "manual"
                            ? "Verifier Network →"
                            : "Check it on-chain →"}
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-muted max-w-xl">
            Tip: click a policy number to open your bond certificate. Claims are
            verified by staked operators who must reach a threshold before
            anything pays — TEST-DELAY approves, TEST-ONTIME is denied, real
            flights are checked against live flight data. Each verdict is sealed
            on commit and opened afterwards, and every step is recorded
            on-chain.
          </p>
        </div>
      )}

      {certRow && publicKey && (
        <PolicyCertificate
          policy={certRow}
          holder={publicKey.toBase58()}
          onClose={() => setCertRow(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* section                                                             */
/* ------------------------------------------------------------------ */

function LiveDevnetInner() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { sol, surety, loading } = useBalances(refreshKey);
  const { connected } = useWallet();

  return (
    <div className="glass-card p-6 sm:p-8" id="live-devnet">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-lime-neon/40 bg-lime-neon/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-lime-neon">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-neon animate-pulse" />
            Live devnet — real blockchain
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold">
            Connect a real wallet
          </h2>
          <p className="mt-1 text-sm text-muted max-w-xl">
            Unlike the guided demo, this talks to the actual Solana devnet:
            your real wallet, the real SURETY token, live on-chain balances —
            and real cover purchases. Play money, real technology.
          </p>
        </div>
        <WalletMultiButton />
      </div>

      <div className="mt-6">
        {!connected ? (
          <p className="text-sm text-muted">
            Connect a wallet to see your live devnet balances. No wallet yet?
            Install{" "}
            <a
              href="https://phantom.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-neon hover:underline"
            >
              Phantom
            </a>{" "}
            and switch on Testnet Mode in its developer settings.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm max-w-xl">
            <div className="rounded-xl bg-void/60 border border-muted/20 p-4">
              <p className="text-xs uppercase tracking-widest text-muted">SOL (devnet)</p>
              <p className="mt-1 font-mono text-xl">
                {loading ? "…" : sol !== null ? sol.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-void/60 border border-muted/20 p-4">
              <p className="text-xs uppercase tracking-widest text-muted">SURETY</p>
              <p className="mt-1 font-mono text-xl text-gradient font-bold">
                {loading ? "…" : surety !== null ? surety.toLocaleString("en-US") : "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      <BuyCover
        suretyBalance={surety}
        onPurchased={() => setRefreshKey((k) => k + 1)}
      />

      <MyPolicies
        refreshKey={refreshKey}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />

      <p className="mt-6 text-xs text-muted">
        SURETY devnet mint:{" "}
        <a
          href="https://explorer.solana.com/address/8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-cyan-neon hover:underline"
        >
          8wAq…sHn9
        </a>{" "}
        — verify the fixed 1B supply and revoked authorities yourself.
      </p>
    </div>
  );
}

export default function LiveDevnet() {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  // Routed through the project worker (see chainMemos) so visitors aren't at
  // the mercy of the public devnet RPC's per-IP throttling.
  const config = useMemo(
    () => ({ commitment: "confirmed" as const, fetch: devnetFetch }),
    []
  );
  return (
    <ConnectionProvider endpoint={DEVNET_RPC} config={config}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <LiveDevnetInner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
