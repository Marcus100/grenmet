import { fileURLToPath } from "node:url";
import { contentSecurityPolicyHeaders } from "@barrelsgd/ui/lib/content-security-policy";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  reactCompiler: true,
  // CSP is Report-Only until a clean report window (docs/security.md). Outside
  // production the helper returns no headers, and Next rejects an empty rule.
  headers() {
    const headers = contentSecurityPolicyHeaders({
      app: "bookings",
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      isProduction: process.env.NODE_ENV === "production",
    });
    return Promise.resolve(
      headers.length > 0 ? [{ source: "/:path*", headers }] : []
    );
  },
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
