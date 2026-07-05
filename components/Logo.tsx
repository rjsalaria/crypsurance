export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <path
        d="M32 8 L54 17 V33 C54 46 44.5 54.5 32 58 C19.5 54.5 10 46 10 33 V17 Z"
        fill="none"
        stroke="url(#logo-g)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M40 24 C38 21.5 35 20.5 32.5 20.5 C27.5 20.5 24.5 23.5 24.5 27 C24.5 35 40 31.5 40 38.5 C40 42.5 36.5 45 32 45 C28.5 45 25.5 43.5 23.5 41"
        fill="none"
        stroke="url(#logo-g)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
