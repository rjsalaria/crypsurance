"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";

const links = [
  { href: "/", label: "Home" },
  { href: "/learn", label: "Learn" },
  { href: "/testnet", label: "Testnet" },
  { href: "/#token", label: "SURETY Token" },
  { href: "/#faq", label: "FAQ" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mt-3 glass-card !rounded-2xl flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="CrypSurance home">
            <Logo className="h-8 w-8" />
            <span className="font-display text-lg font-bold tracking-tight">
              Cryp<span className="text-gradient">Surance</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm text-muted">
            {links.map((l) =>
              l.label === "Testnet" ? (
                <Link
                  key={l.href}
                  href={l.href}
                  className="nav-live flex items-center gap-1.5 font-semibold text-lime-neon hover:brightness-125 transition"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-neon opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-neon" />
                  </span>
                  {l.label}
                </Link>
              ) : (
                <Link key={l.href} href={l.href} className="hover:text-ink transition-colors">
                  {l.label}
                </Link>
              )
            )}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://x.com/crypsurance"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="CrypSurance on X"
              className="p-2 text-muted hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor">
                <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" />
              </svg>
            </a>
            <a
              href="https://t.me/suretoken_official"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SURETY token on Telegram"
              className="p-2 -ml-1 text-muted hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor">
                <path d="M21.9 4.3c.3-1.2-.9-2.2-2-1.7L2.7 9.7c-1.2.5-1.1 2.2.1 2.6l4.4 1.4 1.7 5.5c.3 1 1.6 1.3 2.3.5l2.4-2.6 4.5 3.3c.9.7 2.2.2 2.4-1zM8.5 13.2l8.7-5.5c.2-.1.4.2.2.3l-7.2 6.7-.3 3.1z" />
              </svg>
            </a>
            <Link
              href="/#token"
              className="btn-gradient text-sm font-semibold px-4 py-2 rounded-xl text-white"
            >
              Buy SURETY
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-ink"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <div className="md:hidden glass-card mt-2 px-5 py-4 flex flex-col gap-4 text-sm">
            {links.map((l) =>
              l.label === "Testnet" ? (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="nav-live flex items-center gap-1.5 font-semibold text-lime-neon"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-neon opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-neon" />
                  </span>
                  {l.label}
                </Link>
              ) : (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                  {l.label}
                </Link>
              )
            )}
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className="font-semibold px-4 py-2 rounded-xl border border-violet-neon/50 text-center"
            >
              Launch App
            </Link>
            <Link
              href="/#token"
              onClick={() => setOpen(false)}
              className="btn-gradient font-semibold px-4 py-2 rounded-xl text-white text-center"
            >
              Buy SURETY
            </Link>
            <div className="flex justify-center gap-6 pt-1">
              <a href="https://x.com/crypsurance" target="_blank" rel="noopener noreferrer" aria-label="CrypSurance on X" className="text-muted hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" />
                </svg>
              </a>
              <a href="https://t.me/suretoken_official" target="_blank" rel="noopener noreferrer" aria-label="SURETY token on Telegram" className="text-muted hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M21.9 4.3c.3-1.2-.9-2.2-2-1.7L2.7 9.7c-1.2.5-1.1 2.2.1 2.6l4.4 1.4 1.7 5.5c.3 1 1.6 1.3 2.3.5l2.4-2.6 4.5 3.3c.9.7 2.2.2 2.4-1zM8.5 13.2l8.7-5.5c.2-.1.4.2.2.3l-7.2 6.7-.3 3.1z" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
