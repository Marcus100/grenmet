import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  // A plain static site on Cloudflare Pages (out/). Nothing here may depend on
  // the request date: "today" is worked out in the browser (src/lib/browser-today.ts).
  // Redirects and response headers live in public/_redirects and public/_headers
  // (scripts/pages-headers.mjs adds the Sentry report endpoint after the build).
  output: "export",
  images: { unoptimized: true },
  reactCompiler: true,
};

export default withSentryConfig(nextConfig, {
  org: "grenmet",
  // This independently hosted product must use its own Sentry configuration.
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.NEXT_PUBLIC_RELEASE },
  silent: false,
  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
