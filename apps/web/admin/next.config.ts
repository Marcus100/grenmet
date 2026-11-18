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
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  // CSP is Report-Only until a clean report window (docs/security.md). Outside
  // production the helper returns no headers, and Next rejects an empty rule.
  headers() {
    const headers = contentSecurityPolicyHeaders({
      app: "admin",
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      isProduction: process.env.NODE_ENV === "production",
    });
    return Promise.resolve(
      headers.length > 0 ? [{ source: "/:path*", headers }] : []
    );
  },
};

// Skip the Sentry build plugin when Sentry isn't in play (local dev without a
// DSN) — it wraps every compile otherwise. CI and DSN-configured runs keep it.
const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.CI
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
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
    })
  : nextConfig;
