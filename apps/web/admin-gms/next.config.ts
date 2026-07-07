import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const SVG_REGEX = /\.svg$/;

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  }),
  webpack(config) {
    config.module.rules.push({
      test: SVG_REGEX,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

// Skip the Sentry build plugin when Sentry isn't in play (local dev without a
// DSN) — it wraps every compile otherwise. CI and DSN-configured runs keep it.
const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.CI
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: "grenmet",
      project: process.env.SENTRY_PROJECT ?? "grenmet-staging",
      silent: !process.env.CI,
      widenClientFileUpload: true,

      webpack: {
        treeshake: { removeDebugLogging: true },
        automaticVercelMonitors: false,
      },
    })
  : nextConfig;
