import type { Metadata } from "next";
import Link from "next/link";
import Redirect from "./Redirect";

/**
 * The page moved to /devnet, because devnet and testnet are two different
 * Solana clusters and only one of them is ours.
 *
 * This stub stays. The old URL is printed in a submitted grant application, in
 * posts already published, and in the Colosseum Eternal submission — none of
 * which can be edited after the fact. A 404 there costs a reader we already
 * persuaded to click.
 *
 * The redirect itself is client-side (see Redirect.tsx). The markup below is
 * what someone with JavaScript disabled sees, so it has to stand on its own.
 */
export const metadata: Metadata = {
  title: "Moved to /devnet",
  robots: { index: false, follow: true },
  alternates: { canonical: "/devnet/" },
};

export default function TestnetMoved() {
  return (
    <section className="px-4 sm:px-6 py-24">
      <Redirect />
      <div className="mx-auto max-w-xl glass-card px-6 py-10 text-center">
        <h1 className="font-display text-2xl font-bold">This page moved</h1>
        <p className="mt-3 text-sm text-muted">
          It now lives at <span className="font-mono">/devnet</span> — the
          protocol runs on Solana devnet, which is a different network from
          Solana testnet.
        </p>
        <Link
          href="/devnet/"
          className="btn-gradient mt-6 inline-block rounded-xl px-6 py-3 font-display font-bold text-white"
        >
          Continue to the devnet app →
        </Link>
      </div>
    </section>
  );
}
