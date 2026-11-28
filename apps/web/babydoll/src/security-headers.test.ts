import { readFileSync } from "node:fs";
import path from "node:path";
import { buildContentSecurityPolicy } from "@barrelsgd/ui/lib/content-security-policy";
import { describe, expect, it } from "vitest";

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe("vercel.json security headers", () => {
  const config: VercelConfig = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "..", "vercel.json"), "utf8")
  );
  const headers = config.headers.flatMap((rule) => rule.headers);

  // Built from the shared builder, so vercel.json cannot drift from
  // APP_SOURCES.babydoll without this test failing. Babydoll has no Sentry,
  // so no reporting options are passed.
  it("sends the builder's babydoll policy as Report-Only and no enforcing CSP", () => {
    expect(
      headers.filter((header) =>
        header.key.startsWith("Content-Security-Policy")
      )
    ).toEqual([
      {
        key: "Content-Security-Policy-Report-Only",
        value: buildContentSecurityPolicy({ app: "babydoll" }),
      },
    ]);
  });
});

/**
 * The baseline every static Barrels site sends. Babydoll sent no
 * Strict-Transport-Security while commit, elections and printix all sent
 * max-age=31536000, so a first visit over http was not upgraded.
 *
 * Only `vercel.json` is checked here: it is the source of the header values
 * (apps/web/babydoll/AGENTS.md), and `src/pages-files.test.ts` already fails
 * if `public/_headers`, which Cloudflare Pages actually serves, drifts from it.
 *
 * To change a value, edit `vercel.json` and `public/_headers` together, then
 * this list. HSTS is asserted as a floor rather than an exact value, so
 * raising max-age or adding includeSubDomains needs no edit here.
 */
const BASELINE: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const ONE_YEAR_IN_SECONDS = 31_536_000;
const HSTS_MAX_AGE = /max-age=(\d+)/u;

describe("vercel.json baseline headers", () => {
  const config: VercelConfig = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "..", "vercel.json"), "utf8")
  );
  const sent = new Map(
    config.headers
      .flatMap((rule) => rule.headers)
      .map((header) => [header.key, header.value])
  );

  for (const [key, value] of Object.entries(BASELINE)) {
    it(`sends ${key}`, () => {
      expect(sent.get(key)).toBe(value);
    });
  }

  it("sends HSTS for at least a year", () => {
    const maxAge = HSTS_MAX_AGE.exec(
      sent.get("Strict-Transport-Security") ?? ""
    );
    expect(maxAge).not.toBeNull();
    expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(ONE_YEAR_IN_SECONDS);
  });
});
