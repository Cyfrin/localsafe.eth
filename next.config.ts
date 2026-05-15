import type { NextConfig } from "next";

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
  // Honor NEXT_BUILD_ID when set so release builds are reproducible from a
  // commit (release/build.mjs passes the git SHA). Default behavior otherwise.
  generateBuildId: process.env.NEXT_BUILD_ID ? async () => process.env.NEXT_BUILD_ID as string : undefined,
};

export default nextConfig;
