import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent clients from a previous build from invoking stale Server Functions
  // or loading stale RSC assets after a server restart/deployment. The build
  // script sets this to the exact git commit, so every deployment gets its own
  // cache/version boundary while the existing port and nginx setup remain unchanged.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.GIT_SHA || "hmo-production",
};

export default nextConfig;
