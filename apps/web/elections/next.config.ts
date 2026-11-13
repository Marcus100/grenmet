import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  output: "export",
  images: { unoptimized: true },
  reactCompiler: true,
  // A static export ignores redirects() and headers(): the redirect lives in
  // public/_redirects (Cloudflare Pages) and vercel.json, and the response
  // headers are written to out/_headers by scripts/pages-headers.mjs.
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
