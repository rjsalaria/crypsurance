"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";

const links = [
  { href: "/", label: "Home" },
  { href: "/learn", label: "Learn" },
  { href: "/#token", label: "SURE Token" },
  { href: "/#faq", label: "FAQ" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mt-3 glass-card !rounded-2xl flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="CrypSurance home">
            <Logo className="h-8 w-8" idPrefix="nav" />
            <span className="font-display text-lg font-bold tracking-tight">
              Cryp<span className="text-gradient">Surance</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm text-muted">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-ink transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/app"
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-violet-neon/50 hover:bg-violet-neon/10 transition-colors"
            >
              Launch App
            </Link>
            <Link
              href="/#token"
              className="btn-gradient text-sm font-semibold px-4 py-2 rounded-xl text-white"
            >
              Buy SURE
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
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                {l.label}
              </Link>
            ))}
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
              Buy SURE
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
