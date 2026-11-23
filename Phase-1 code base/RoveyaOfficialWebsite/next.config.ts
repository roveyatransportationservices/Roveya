import type { NextConfig } from "next";

// This folder sits inside the main ROVEYA website repo, so the root is pinned here
// or Next would load the parent website's middleware and lockfile.
const root = process.cwd();

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root },
  outputFileTracingRoot: root,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
