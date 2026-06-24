import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile higher in the tree can't make
  // Turbopack infer the wrong root (build/dev + Vercel root detection).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
