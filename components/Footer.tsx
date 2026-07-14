import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="relative border-t border-muted/15 mt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="font-display text-lg font-bold">
              Cryp<span className="text-gradient">Surance</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-muted max-w-sm leading-relaxed">
            Decentralized cover protocol delivering fair, fast and secure
            protection — no middlemen, no paperwork, no waiting. Powered by the
            SURETY token.
          </p>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-muted">
            Protocol
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/learn" className="text-muted hover:text-ink transition-colors">How it works</Link></li>
            <li><Link href="/app" className="text-muted hover:text-ink transition-colors">Demo</Link></li>
            <li><Link href="/testnet" className="text-muted hover:text-ink transition-colors">Testnet</Link></li>
            <li><Link href="/#token" className="text-muted hover:text-ink transition-colors">SURETY Token</Link></li>
            <li><Link href="/#roadmap" className="text-muted hover:text-ink transition-colors">Roadmap</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-muted">
            Community
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a href="https://x.com/crypsurance" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink transition-colors">
                X / Twitter
              </a>
            </li>
            <li>
              <a href="https://t.me/suretoken_official" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink transition-colors">
                Telegram
              </a>
            </li>
            <li>
              <a href="/whitepaper.pdf" className="text-muted hover:text-ink transition-colors">
                Whitepaper
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-muted/10 py-6">
        <p className="text-center text-xs text-muted max-w-3xl mx-auto px-4">
          © {new Date().getFullYear()} CrypSurance. All rights reserved.
          CrypSurance is a decentralized, membership-based cover protocol under
          development. It is not an insurance company, and nothing on this site
          constitutes an offer of insurance or financial advice.
        </p>
      </div>
    </footer>
  );
}
