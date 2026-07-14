"use client";

import { useEffect, useMemo, useState } from "react";
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
import { clusterApiUrl, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

/** The real SURETY devnet mint created by solana/create-token.js. */
const SURETY_MINT = new PublicKey(
  "8wAqKooKyqubCG9nNx2bfcq9TQ9jEJxojyhAMAdfsHn9"
);

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton
    ),
  { ssr: false }
);

function Balances() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
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
            sum +
            (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
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
  }, [publicKey, connection]);

  if (!connected) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
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
  );
}

function LiveDevnetInner() {
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
            Unlike the guided demo above, this talks to the actual Solana
            devnet: your real wallet, the real SURETY token, live on-chain
            balances. Play money, real technology.
          </p>
        </div>
        <WalletMultiButton />
      </div>

      <div className="mt-6">
        <Balances />
      </div>

      <p className="mt-4 text-xs text-muted">
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
