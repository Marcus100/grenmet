// Writes out/_headers for Cloudflare Pages after `next build`.
//
// A static export ignores next.config's headers(), so the response headers the
// site sent from Vercel are written here instead, from the same shared builder
// (packages/ui content-security-policy). Run from apps/web/elections.

import { writeFileSync } from "node:fs";
import { contentSecurityPolicyHeaders } from "@barrelsgd/ui/lib/content-security-policy";

/** The `_headers` text for one catch-all rule. */
export function pagesHeaders(entries) {
  const lines = [
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    ...entries.map((entry) => `  ${entry.key}: ${entry.value}`),
  ];
  return ["/*", ...lines, ""].join("\n");
}

if (import.meta.main) {
  const entries = contentSecurityPolicyHeaders({
    app: "elections",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    // The export is only ever deployed, so it always carries the policy.
    isProduction: true,
  });
  writeFileSync(
    new URL("../out/_headers", import.meta.url),
    pagesHeaders(entries)
  );
}
