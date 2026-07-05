import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Hostinger shared hosting (Apache serves the out/ folder).
  output: "export",
  // /learn -> learn/index.html so Apache resolves clean URLs without rewrites.
  trailingSlash: true,
};

export default nextConfig;
