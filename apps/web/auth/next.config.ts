import { fileURLToPath } from "node:url";
import { contentSecurityPolicyHeaders } from "@barrelsgd/ui/lib/content-security-policy";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
  output: "standalone",
  async redirects() {
    // Sign-up lives at /signup. Common guesses land on the real page, not a 404.
    // Temporary (307), so a later change of plan is not stuck in a browser cache.
    return [
      { source: "/sign-up", destination: "/signup", permanent: false },
      { source: "/register", destination: "/signup", permanent: false },
    ];
  },
  async headers() {
    // CSP is Report-Only until a clean report window (docs/security.md). Outside
    // production the helper returns no headers, so the rule is left out.
    const csp = contentSecurityPolicyHeaders({
      app: "auth",
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      isProduction: process.env.NODE_ENV === "production",
    });
    return [
      // The invitation page is reached from an emailed link; send no referrer from it.
      {
        source: "/superuser-invite",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      ...(csp.length > 0 ? [{ source: "/:path*", headers: csp }] : []),
    ];
  },
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  }),
};

export default withSentryConfig(nextConfig, {
  org: "grenmet",
  // Comma-separated: one build uploads source maps to every environment's project.
  project: process.env.SENTRY_PROJECT
    ? process.env.SENTRY_PROJECT.split(",")
    : undefined,
  release: { name: process.env.NEXT_PUBLIC_RELEASE },
  silent: false,
  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
