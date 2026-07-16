"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Buffer } from "buffer";
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
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import "@solana/wallet-adapter-react-ui/styles.css";

/** The real SURETY devnet mint created by solana/create-token.js. */
const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);
/** Testnet underwriting pool = the devnet holding wallet. */
const POOL_WALLET = new PublicKey(
  "9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy"
);
// Memo v1 — v2 is not currently deployed on devnet
const MEMO_PROGRAM = new PublicKey(
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"
);
const DECIMALS = 9n;
const PREMIUM_RATE = 0.024; // travel-delay parametric, 2.4% of payout

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const fmt = (n: number) => n.toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/* balances                                                            */
/* ------------------------------------------------------------------ */

function useBalances(refreshKey: number) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [surety, setSurety] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setSol(null);
      setSurety(null);
      return;
    }
    let cancelled = false;
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
  }, [publicKey, connection, refreshKey]);

  return { sol, surety, loading };
}

/* ------------------------------------------------------------------ */
/* buy cover (M3 v1 — memo-recorded policy)                           */
/* ------------------------------------------------------------------ */

type Purchase = {
  policyId: string;
  payout: number;
  premium: number;
  signature: string;
  holder: string;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purchase, setPurchase] = useState<Purchase | null>(null);

  const premium = Math.max(1, Math.round(payout * PREMIUM_RATE));
  const insufficient = suretyBalance !== null && suretyBalance < premium;

  const buy = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      const policyId = `CSD-${Date.now().toString(36).toUpperCase()}`;
      const fromAta = await getAssociatedTokenAddress(SURETY_MINT, publicKey);
      const toAta = await getAssociatedTokenAddress(SURETY_MINT, POOL_WALLET);

      const memo = JSON.stringify({
        v: 1,
        kind: "policy",
        product: "travel-delay",
        id: policyId,
        payout,
        premium,
        holder: publicKey.toBase58(),
      });

      const tx = new Transaction().add(
        createTransferInstruction(
          fromAta,
          toAta,
          publicKey,
          BigInt(premium) * 10n ** DECIMALS
        ),
        new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM,
          data: Buffer.from(memo, "utf8"),
        })
      );

      const latest = await connection.getLatestBlockhash();
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed"
      );

      setPurchase({
        policyId,
        payout,
        premium,
        signature,
        holder: publicKey.toBase58(),
      });
      onPurchased();
    } catch (e) {
      setError(
        e instanceof Error ? e.message.slice(0, 140) : "Transaction failed"
      );
    } finally {
      setBusy(false);
    }
  }, [publicKey, payout, premium, connection, sendTransaction, onPurchased]);

  if (!connected) return null;

  return (
    <div className="mt-8 border-t border-muted/15 pt-6">
      <h3 className="font-display text-xl font-bold">
        Buy real cover on devnet{" "}
        <span className="ml-2 align-middle rounded-full border border-cyan-neon/40 bg-cyan-neon/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-neon">
          M3 · v1
        </span>
      </h3>
      <p className="mt-1 text-sm text-muted max-w-xl">
        Travel-delay parametric cover. Your premium moves real devnet SURETY
        into the underwriting pool, and your policy terms are written into the
        transaction itself — permanently on-chain. (v1 records policies as
        transaction memos; policy accounts and NFT certificates arrive with the
        M2 programs.)
      </p>

      {!purchase ? (
        <div className="mt-5 grid gap-6 md:grid-cols-2 max-w-3xl">
          <div>
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
              disabled={busy || insufficient}
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
                <dt className="text-[10px] uppercase tracking-widest text-muted">Policy ID</dt>
                <dd className="font-mono text-cyan-neon mt-0.5">{purchase.policyId}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted">Product</dt>
                <dd className="mt-0.5 font-semibold">Travel Delay (parametric)</dd>
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
              View the transaction (and your policy memo) on Solana Explorer →
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
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <LiveDevnetInner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
