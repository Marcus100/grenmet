import { fileURLToPath } from "node:url";
import { contentSecurityPolicyHeaders } from "@barrelsgd/ui/lib/content-security-policy";
import { withContentCollections } from "@content-collections/next";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  output: "standalone",
  reactCompiler: true,
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
    outputFileTracingIncludes: {
      "/**/*": ["./content/**/*.mdx"],
    },
  }),
  pageExtensions: ["js", "jsx", "ts", "tsx"],
  // CSP is Report-Only until a clean 7-day report window (docs/security.md).
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: contentSecurityPolicyHeaders({
          app: "signal",
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
          isProduction: process.env.NODE_ENV === "production",
        }),
      },
    ]);
  },
};

export default withContentCollections(nextConfig).then((config) =>
  withSentryConfig(config as NextConfig, {
    org: "grenmet",
    project: process.env.SENTRY_PROJECT,
    release: { name: process.env.NEXT_PUBLIC_RELEASE },
    silent: false,
    widenClientFileUpload: true,

    webpack: {
      treeshake: { removeDebugLogging: true },
      automaticVercelMonitors: false,
    },
  })
);
