import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/cron/refresh": ["./config/pos-categories.yaml"],
    "/api/snapshot": ["./config/pos-categories.yaml"],
    "/": ["./config/pos-categories.yaml"],
  },
};

export default nextConfig;
