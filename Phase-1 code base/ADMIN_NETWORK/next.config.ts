import type { NextConfig } from "next";

// This folder sits inside the main ROVEYA website repo, so the root is pinned here
// or Next would load the parent website's middleware and lockfile.
const root = process.cwd();

const config: NextConfig = {
  poweredByHeader: false,
  // Staging builds do not ship an ESLint install; typecheck remains via tsc / CI tests.
  eslint: { ignoreDuringBuilds: true },
  turbopack: { root },
  outputFileTracingRoot: root,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default config;
