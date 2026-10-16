import path from "node:path";
import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  output: "standalone",
  reactCompiler: true,
  outputFileTracingRoot: path.join(import.meta.dirname, "../../.."),
};
export default withSentryConfig(withPayload(config), {
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
