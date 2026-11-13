import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Public warning pages are rendered per request, then cached at the edge.
// `s-maxage` lets Cloudflare serve a fresh copy for a minute; the stale
// directives let it keep serving the last good page while the origin is slow
// or down. Browsers never keep their own copy (`max-age=0`).
const EDGE_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400";

// The staff warning desk (/desk) and its single sign-on routes (/auth) carry a
// forecaster's session: never cached anywhere. Cloudflare's cache rules cache
// static assets only and bypass `*_session` cookies (cloudflare-proxy.md).
// `no-transform` stops Cloudflare rewriting the HTML: its Email Address
// Obfuscation turned the warning contact ("meteorology@gaa.gd; 1-473-…") into
// a link that decodes back as two text nodes, so React refused to hydrate
// /desk/new (error #418, issue #1327). Staff pages need no scraper protection.
const STAFF_NO_STORE = "private, no-store, no-transform";
const STAFF_PATHS = ["/desk", "/desk/:path*", "/auth/:path*"];

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
  experimental: {
    // Server actions default to a 1 MB body. The desk's CAP import accepts up
    // to 5 MiB of XML (apps/api/fastapi/src/cap/validation.py) and JSON
    // escaping adds some overhead, so 6 MB is the smallest limit that never
    // refuses a document the API would take. The form checks the size first.
    serverActions: { bodySizeLimit: "6mb" },
  },
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  headers: async () => [
    {
      // Public pages only: static assets keep their immutable headers, health
      // and the feed proxies set their own, and the staff desk and its sign-in
      // routes must never be stored by the edge or the browser (below).
      // /runtime-env.js sets its own short cache and must never go stale.
      source: "/((?!_next/|api/|feeds/|desk|auth/|runtime-env\\.js).*)",
      headers: [{ key: "Cache-Control", value: EDGE_CACHE }],
    },
    ...STAFF_PATHS.map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: STAFF_NO_STORE },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    })),
  ],
};

export default nextConfig;
