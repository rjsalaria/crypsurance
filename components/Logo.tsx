/* Official brand mark — the exact logo asset, not a vector approximation. */
export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`${className} select-none object-contain`}
    />
  );
}
