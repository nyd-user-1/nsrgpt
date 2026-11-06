import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["geist"],
  // NSRgpt (2026-11-05): the chart index is the root page, so /viz goes there.
  async redirects() {
    return [{ source: "/viz", destination: "/", permanent: false }];
  },
};

export default nextConfig;
