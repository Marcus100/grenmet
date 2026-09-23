import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  reactCompiler: true,
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
