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
