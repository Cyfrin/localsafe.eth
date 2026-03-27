import type { NextConfig } from "next";

declare const process: { env: Record<string, string | undefined> };

// Use relative assetPrefix for IPFS deployments (assets served under /ipfs/<CID>/),
// empty string for standard domain deployments (localsafe.cyfrin.io).
const assetPrefix = process.env.NEXT_PUBLIC_IPFS_BUILD === "true" ? "./" : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  assetPrefix,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
