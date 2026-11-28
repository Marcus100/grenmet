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
 * Cloudflare Pages serves this site from `public/_headers`; `vercel.json` is
 * kept in step because the site has been hosted both ways. Both files were
 * missing `Strict-Transport-Security` while every other static Barrels site
 * (commit, elections, printix) sent `max-age=31536000`, so a first visit over
 * http was not upgraded. These tests pin the baseline in both files and check
 * that the two agree, because they are edited by hand.
 */
const BASELINE: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};

// A header line is indented; `/*` and comments are not.
const HEADER_LINE = /^\s+\S/u;

function parsePagesHeaders(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!HEADER_LINE.test(line)) {
      continue;
    }
    const at = line.indexOf(":");
    if (at === -1) {
      continue;
    }
    found[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return found;
}

describe("public/_headers (Cloudflare Pages)", () => {
  const pages = parsePagesHeaders(
    readFileSync(
      path.resolve(import.meta.dirname, "..", "public", "_headers"),
      "utf8"
    )
  );

  for (const [key, value] of Object.entries(BASELINE)) {
    it(`sends ${key}`, () => {
      expect(pages[key]).toBe(value);
    });
  }

  it("sends the same Report-Only policy vercel.json sends", () => {
    expect(pages["Content-Security-Policy-Report-Only"]).toBe(
      buildContentSecurityPolicy({ app: "babydoll" })
    );
  });

  it("sends no enforcing CSP", () => {
    expect(pages["Content-Security-Policy"]).toBeUndefined();
  });
});

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
});
