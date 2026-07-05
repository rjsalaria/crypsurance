export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-neon">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-muted leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
