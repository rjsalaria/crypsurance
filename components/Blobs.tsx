const blobStyle = (color: string) => ({
  background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
});

export default function Blobs() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="blob h-140 w-140 -top-40 -left-32"
        style={{ ...blobStyle("rgba(139,92,246,0.45)"), animationDelay: "0s" }}
      />
      <div
        className="blob h-120 w-120 top-1/3 -right-40"
        style={{ ...blobStyle("rgba(34,211,238,0.35)"), animationDelay: "-6s" }}
      />
      <div
        className="blob h-110 w-110 bottom-0 left-1/3"
        style={{ ...blobStyle("rgba(232,121,249,0.3)"), animationDelay: "-12s" }}
      />
      <div className="absolute inset-0 grid-overlay" />
    </div>
  );
}
