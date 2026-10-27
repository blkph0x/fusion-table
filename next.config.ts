import type { NextConfig } from "next";

// The deployed Apache site uses /fusion. Keep ordinary builds portable;
// scripts/Start-Fusion.ps1 selects the matching profile explicitly.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) {
  throw new Error("NEXT_PUBLIC_BASE_PATH must be empty or a path such as /fusion.");
}

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
