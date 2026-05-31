import { fileURLToPath } from "node:url";
import { withContentCollections } from "@content-collections/next";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
    outputFileTracingIncludes: {
      "/**/*": ["./src/content/**/*.mdx"],
    },
  }),
  pageExtensions: ["js", "jsx", "ts", "tsx"],
};

export default withContentCollections(nextConfig).then((config) =>
  withSentryConfig(config as NextConfig, {
    org: "grenmet",
    project: process.env.SENTRY_PROJECT ?? "grenmet-staging",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  })
);
