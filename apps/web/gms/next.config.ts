import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { routeMoveRedirects } from "./src/lib/route-moves";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Bold sky IA: old section roots redirect to their new homes.
  redirects: async () => routeMoveRedirects(),
  images: {
    remotePatterns: [{ hostname: "images.unsplash.com" }],
  },
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  }),
};

export default withSentryConfig(nextConfig, {
  org: "grenmet",
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.NEXT_PUBLIC_RELEASE },
  silent: false,
  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
