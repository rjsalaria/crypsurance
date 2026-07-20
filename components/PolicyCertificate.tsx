"use client";

import { useRef } from "react";

export type CertPolicy = {
  id: string;
  flight: string;
  date: string;
  payout: number;
  premium: number;
  status: "active" | "requested" | "manual" | "paid" | "denied";
  buySig?: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const statusLabel: Record<CertPolicy["status"], { text: string; color: string }> = {
  active: { text: "ACTIVE", color: "#a3e635" },
  requested: { text: "CLAIM PENDING", color: "#22d3ee" },
  manual: { text: "IN VERIFICATION", color: "#c4b5fd" },
  paid: { text: "PAID ✓", color: "#22d3ee" },
  denied: { text: "CLOSED", color: "#fb7185" },
};

/** Renders the on-chain policy as a premium, downloadable bond certificate. */
export default function PolicyCertificate({
  policy,
  holder,
  onClose,
}: {
  policy: CertPolicy;
  holder: string;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const st = statusLabel[policy.status];

  const download = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = 1000 * scale;
      canvas.height = 640 * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 1000, 640);
      const a = document.createElement("a");
      a.download = `CrypSurance-${policy.id}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = src;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-void/85 backdrop-blur-sm p-4 animate-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        {/* the certificate */}
        <svg
          ref={svgRef}
          viewBox="0 0 1000 640"
          className="w-full h-auto rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.4)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="cert-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0b0620" />
              <stop offset="1" stopColor="#160a34" />
            </linearGradient>
            <linearGradient id="cert-border" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="0.5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#e879f9" />
            </linearGradient>
            <linearGradient id="cert-accent" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="0.5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#e879f9" />
            </linearGradient>
            <radialGradient id="cert-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" />
              <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* border + bg */}
          <rect x="0" y="0" width="1000" height="640" rx="24" fill="url(#cert-border)" />
          <rect x="4" y="4" width="992" height="632" rx="21" fill="url(#cert-bg)" />
          <circle cx="820" cy="140" r="220" fill="url(#cert-glow)" />
          <circle cx="150" cy="560" r="180" fill="url(#cert-glow)" />

          {/* faint guilloché grid */}
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1="40"
              y1={70 + i * 40}
              x2="960"
              y2={70 + i * 40}
              stroke="#a89fd0"
              strokeOpacity="0.05"
            />
          ))}

          {/* header */}
          <g transform="translate(48, 46)">
            {/* shield mark */}
            <path
              d="M22 2 L40 10 V24 C40 34 32 40 22 43 C12 40 4 34 4 24 V10 Z"
              fill="none"
              stroke="url(#cert-accent)"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <text x="22" y="30" fontFamily="Georgia, serif" fontSize="20" fontWeight="bold" fill="#22d3ee" textAnchor="middle">S</text>
            <text x="60" y="20" fontFamily="system-ui, sans-serif" fontSize="12" letterSpacing="4" fill="#a89fd0">CRYPSURANCE PROTOCOL</text>
            <text x="60" y="46" fontFamily="Georgia, serif" fontSize="30" fontWeight="bold" fill="#eae6ff">Policy Bond Certificate</text>
          </g>

          {/* status seal */}
          <g transform="translate(830, 60)">
            <rect x="0" y="0" width="122" height="34" rx="17" fill="none" stroke={st.color} strokeWidth="2" />
            <text x="61" y="23" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="bold" letterSpacing="2" fill={st.color} textAnchor="middle">{st.text}</text>
          </g>

          <line x1="48" y1="140" x2="952" y2="140" stroke="#a89fd0" strokeOpacity="0.2" />

          {/* cover amount hero */}
          <text x="48" y="200" fontFamily="system-ui, sans-serif" fontSize="13" letterSpacing="2" fill="#a89fd0">COVER AMOUNT</text>
          <text x="48" y="258" fontFamily="Georgia, serif" fontSize="64" fontWeight="bold" fill="url(#cert-accent)">{fmt(policy.payout)}</text>
          <text x="52" y="288" fontFamily="system-ui, sans-serif" fontSize="15" fill="#a89fd0">SURETY · Travel Delay parametric cover</text>

          {/* data grid */}
          {[
            { label: "CERTIFICATE No.", value: policy.id, color: "#22d3ee" },
            { label: "POLICYHOLDER", value: short(holder), color: "#eae6ff" },
            { label: "FLIGHT", value: policy.flight, color: "#eae6ff" },
            { label: "COVERED DATE", value: policy.date, color: "#eae6ff" },
            { label: "PREMIUM PAID", value: `${fmt(policy.premium)} SURETY`, color: "#eae6ff" },
            { label: "PAYOUT TO", value: "Policyholder wallet", color: "#eae6ff" },
          ].map((f, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            return (
              <g key={f.label} transform={`translate(${48 + col * 320}, ${348 + row * 68})`}>
                <text x="0" y="0" fontFamily="system-ui, sans-serif" fontSize="12" letterSpacing="1.5" fill="#a89fd0">{f.label}</text>
                <text x="0" y="26" fontFamily="system-ui, sans-serif" fontSize="19" fontWeight="600" fill={f.color}>{f.value}</text>
              </g>
            );
          })}

          {/* QR-ish verification motif */}
          <g transform="translate(830, 470)">
            <rect x="0" y="0" width="110" height="110" rx="10" fill="#0b0620" stroke="#a89fd0" strokeOpacity="0.25" />
            {Array.from({ length: 36 }).map((_, i) => {
              const x = 14 + (i % 6) * 14;
              const y = 14 + Math.floor(i / 6) * 14;
              const on = (i * 37 + policy.id.charCodeAt(policy.id.length - 1)) % 3 !== 0;
              return on ? <rect key={i} x={x} y={y} width="10" height="10" rx="2" fill="#22d3ee" fillOpacity="0.85" /> : null;
            })}
          </g>

          {/* footer */}
          <line x1="48" y1="560" x2="792" y2="560" stroke="#a89fd0" strokeOpacity="0.2" />
          <text x="48" y="588" fontFamily="system-ui, sans-serif" fontSize="13" fill="#a89fd0">Secured by smart contract · Solana devnet · terms immutable on-chain</text>
          <text x="48" y="610" fontFamily="system-ui, sans-serif" fontSize="12" fill="#6f6894">crypsurance.io · Digital bond certificate — testnet demonstration</text>
        </svg>

        {/* actions */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={download}
            className="btn-gradient px-6 py-3 rounded-xl font-display font-bold text-white"
          >
            ↓ Download certificate
          </button>
          {policy.buySig && (
            <a
              href={`https://explorer.solana.com/tx/${policy.buySig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl font-display font-bold border border-cyan-neon/50 text-cyan-neon hover:bg-cyan-neon/10 transition-colors"
            >
              Verify on-chain →
            </a>
          )}
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-semibold border border-muted/30 hover:border-muted/60 transition-colors"
          >
            Close
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted max-w-lg mx-auto">
          This certificate is your permanent, verifiable proof of cover — backed
          by the on-chain transaction. At mainnet it is minted as a transferable
          NFT that lives in your wallet.
        </p>
      </div>
    </div>
  );
}
