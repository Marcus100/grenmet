import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Must equal the babydoll policy literal in
// packages/ui/src/lib/content-security-policy.test.ts (built by
// buildContentSecurityPolicy({ app: "babydoll" }), no Sentry reporting).
const BABYDOLL_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "worker-src 'self'",
].join("; ");

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe("vercel.json security headers", () => {
  const config: VercelConfig = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "..", "vercel.json"), "utf8")
  );
  const headers = config.headers.flatMap((rule) => rule.headers);

  it("sends the babydoll policy as Report-Only and no enforcing CSP", () => {
    expect(
      headers.filter((header) =>
        header.key.startsWith("Content-Security-Policy")
      )
    ).toEqual([
      { key: "Content-Security-Policy-Report-Only", value: BABYDOLL_POLICY },
    ]);
  });
});
