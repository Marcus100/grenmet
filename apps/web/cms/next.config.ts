import path from "node:path";
import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../.."),
};
export default withSentryConfig(withPayload(config), {
  org: "grenmet",
  project: process.env.SENTRY_PROJECT ?? "grenmet-staging",
  silent: !process.env.CI,
  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
