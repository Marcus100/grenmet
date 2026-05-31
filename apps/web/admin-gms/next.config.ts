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

export default withSentryConfig(nextConfig, {
  org: "grenmet",
  project: process.env.SENTRY_PROJECT ?? "grenmet-staging",
  silent: !process.env.CI,
  widenClientFileUpload: true,

  disableLogger: true,
  automaticVercelMonitors: false,
});
