import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  images: {
    remotePatterns: [{ hostname: "images.unsplash.com" }],
  },
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  }),
};

export default withSentryConfig(nextConfig, {
  org: "grenmet",
  project: process.env.SENTRY_PROJECT ?? "grenmet-staging",
  silent: !process.env.CI,
  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
