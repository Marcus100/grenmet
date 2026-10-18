import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
};

// Skip the Sentry build plugin when Sentry isn't in play (local dev without a
// DSN) — it wraps every compile otherwise. CI and DSN-configured runs keep it.
const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.CI
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: "grenmet",
      project: process.env.SENTRY_PROJECT,
      release: { name: process.env.NEXT_PUBLIC_RELEASE },
      silent: false,
      widenClientFileUpload: true,

      webpack: {
        treeshake: { removeDebugLogging: true },
        automaticVercelMonitors: false,
      },
    })
  : nextConfig;
