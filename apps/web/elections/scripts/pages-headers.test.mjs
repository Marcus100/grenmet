import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildContentSecurityPolicy,
  contentSecurityPolicyHeaders,
} from "@barrelsgd/ui/lib/content-security-policy";
import { withReporting } from "./pages-headers.mjs";

const baseText = readFileSync(
  new URL("../public/_headers", import.meta.url),
  "utf8"
);
const DSN = "https://examplekey@sentry.example.test/42";
const REPORT_URI_PATTERN =
  /report-uri https:\/\/sentry\.example\.test\/api\/42\/security/u;
const CONNECT_SENTRY_PATTERN =
  /connect-src 'self' .*https:\/\/sentry\.example\.test/u;

test("public/_headers carries the shared report-only policy for every path", () => {
  const policy = buildContentSecurityPolicy({ app: "elections" });
  const lines = baseText.split("\n");
  assert.equal(lines[0], "/*");
  assert.ok(lines.includes(`  Content-Security-Policy-Report-Only: ${policy}`));
  assert.ok(lines.includes("  X-Content-Type-Options: nosniff"));
  // Report-only until the clean report window (docs/security.md): never enforced.
  assert.ok(
    !lines.some((line) => line.startsWith("  Content-Security-Policy:"))
  );
});

test("the Sentry DSN adds report-uri, the reporting endpoint and the ingest origin", () => {
  const reporting = contentSecurityPolicyHeaders({
    app: "elections",
    dsn: DSN,
    environment: "production",
    isProduction: true,
  });
  const text = withReporting(baseText, reporting);
  const lines = text.split("\n");
  assert.equal(lines[0], "/*");
  // Exactly one report-only policy, and it is the one with report-uri.
  const policyLines = lines.filter((line) =>
    line.startsWith("  Content-Security-Policy-Report-Only:")
  );
  assert.equal(policyLines.length, 1);
  assert.match(policyLines[0] ?? "", REPORT_URI_PATTERN);
  assert.match(policyLines[0] ?? "", CONNECT_SENTRY_PATTERN);
  assert.ok(
    lines.some((line) =>
      line.startsWith("  Reporting-Endpoints: csp-endpoint=")
    )
  );
  // The other headers survive the merge.
  assert.ok(lines.includes("  X-Frame-Options: DENY"));
  assert.ok(
    lines.includes("  Referrer-Policy: strict-origin-when-cross-origin")
  );
});

test("outside production no reporting headers are added", () => {
  const reporting = contentSecurityPolicyHeaders({
    app: "elections",
    dsn: DSN,
    isProduction: false,
  });
  assert.equal(withReporting(baseText, reporting), baseText);
});
