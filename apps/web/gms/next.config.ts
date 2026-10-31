import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { plannedRewrites } from "./src/lib/planned-routes";
import { routeMoveRedirects } from "./src/lib/route-moves";
import { STORM_CACHE_CONTROL } from "./src/lib/storm-cache";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
  output: "standalone",
  // Bold sky IA: old section roots redirect to their new homes.
  redirects: async () => routeMoveRedirects(),
  // Planned placeholder pages live under an internal prefix so unknown URLs
  // match no page and get the server-rendered 404 (src/lib/planned-routes.ts).
  rewrites: async () => plannedRewrites(),
  // Storm mode: alert pages are cacheable so the CDN can serve the last good copy.
  headers: async () => [
    {
      source: "/alerts/:path*",
      headers: [{ key: "Cache-Control", value: STORM_CACHE_CONTROL }],
    },
    // Draft previews (signed CMS links) are never cached or indexed.
    {
      source: "/preview",
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
  ],
  images: {
    remotePatterns: [{ hostname: "images.unsplash.com" }],
  },
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  }),
};

export default withSentryConfig(nextConfig, {
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
