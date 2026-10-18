import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Public warning pages are rendered per request, then cached at the edge.
// `s-maxage` lets Cloudflare serve a fresh copy for a minute; the stale
// directives let it keep serving the last good page while the origin is slow
// or down. Browsers never keep their own copy (`max-age=0`).
const EDGE_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  headers: async () => [
    {
      // Pages only: static assets keep their immutable headers, health and
      // the feed proxies set their own.
      source: "/((?!_next/|api/|feeds/).*)",
      headers: [{ key: "Cache-Control", value: EDGE_CACHE }],
    },
  ],
};

export default nextConfig;
