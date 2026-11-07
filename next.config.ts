import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["geist"],
  // The codespace's port proxy sends Origin localhost:3000 with the github.dev host forwarded, which
  // Next reads as a cross-site Server Action and refuses (2026-11-07). Production is unaffected.
  experimental: { serverActions: { allowedOrigins: ["localhost:3000", "*.app.github.dev"] } },
  // NSRgpt (2026-11-05): the chart index is the root page, so /viz goes there.
  async redirects() {
    return [
      { source: "/viz", destination: "/", permanent: false },
      // Knowledge map 2 is the knowledge map's 3D switch now (2026-11-06).
      { source: "/viz/knowledge-3d", destination: "/viz/knowledge", permanent: false },
    ];
  },
};

export default nextConfig;
