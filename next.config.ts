import type { NextConfig } from "next";

const deploymentIdSource =
  process.env.NEXT_DEPLOYMENT_ID || process.env.GIT_SHA || "hmo-production";

const nextConfig: NextConfig = {
  // Vercel limits custom deployment IDs to 32 characters. Keep the commit-based
  // identifier for cache/version isolation while trimming Git SHAs to a stable,
  // comfortably valid length.
  deploymentId: deploymentIdSource.slice(0, 20),
};

export default nextConfig;
