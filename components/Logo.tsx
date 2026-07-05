export default function Logo({
  className = "h-8 w-8",
  idPrefix = "lg",
}: {
  className?: string;
  idPrefix?: string;
}) {
  const g = `${idPrefix}-grad`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f7fe0" />
          <stop offset="0.5" stopColor="#19b8e8" />
          <stop offset="1" stopColor="#2ee5e0" />
        </linearGradient>
      </defs>
      {/* angular shield */}
      <path
        d="M32 3 L57 15.5 V34 C57 46.5 46.5 55.8 32 61 C17.5 55.8 7 46.5 7 34 V15.5 Z"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      {/* hexagonal S monogram */}
      <path
        d="M45.5 20.5 H27.5 L21.5 26 V29 L26.5 33.5 H38 L43 38 V41.5 L37.5 46.5 H18.5"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
