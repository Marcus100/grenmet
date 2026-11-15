// Cloudflare Pages headers for the static export (run after `next build`).
//
// public/_headers is copied into out/ and holds the policy for a build without a
// Sentry DSN. The production build has one, and its Sentry report endpoint and
// ingest origin must be added to the policy, or the report-only policy would stop
// reporting violations. The additions come from the same shared builder as the
// policy (packages/ui content-security-policy). Run from apps/web/elections.

import { readFileSync, writeFileSync } from "node:fs";
import { contentSecurityPolicyHeaders } from "@barrelsgd/ui/lib/content-security-policy";

const REPORT_ONLY = "  Content-Security-Policy-Report-Only:";

/**
 * Merges the Sentry reporting headers into a `_headers` file. The base file's
 * report-only policy is replaced by the one that carries `report-uri`; the other
 * header lines are kept as they are.
 */
export function withReporting(baseText, reportingEntries) {
  const replacesPolicy = reportingEntries.some(
    (entry) => entry.key === "Content-Security-Policy-Report-Only"
  );
  const kept = baseText
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("  ") &&
        !(replacesPolicy && line.startsWith(REPORT_ONLY))
    );
  const added = reportingEntries.map(
    (entry) => `  ${entry.key}: ${entry.value}`
  );
  return ["/*", ...kept, ...added, ""].join("\n");
}

if (import.meta.main) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    const reportingEntries = contentSecurityPolicyHeaders({
      app: "elections",
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      isProduction: true,
    });
    const baseText = readFileSync(
      new URL("../public/_headers", import.meta.url),
      "utf8"
    );
    writeFileSync(
      new URL("../out/_headers", import.meta.url),
      withReporting(baseText, reportingEntries)
    );
  }
}
