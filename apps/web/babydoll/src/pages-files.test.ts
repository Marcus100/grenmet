import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { siteBookingLink } from "@/lib/book-link";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

// Cloudflare Pages serves `public/_headers` and `public/_redirects` with the
// static site. Until the Vercel project is gone, vercel.json stays the source
// of the header values, so the two hosts cannot drift.
describe("Cloudflare Pages files", () => {
  it("sends the same response headers as vercel.json, for every path", () => {
    const config: VercelConfig = JSON.parse(read("vercel.json"));
    expect(config.headers.map((rule) => rule.source)).toEqual(["/(.*)"]);
    const expected = [
      "/*",
      ...(config.headers[0]?.headers ?? []).map(
        (header) => `  ${header.key}: ${header.value}`
      ),
      "",
    ].join("\n");
    expect(read("public/_headers")).toBe(expected);
  });

  it("keeps the old booking addresses working", () => {
    const lines = read("public/_redirects").trim().split("\n");
    // The removed on-site flow lived at /book and /booking/<token>.
    expect(lines).toContain(`/book ${siteBookingLink().href} 302`);
    expect(lines).toContain("/booking/* /contact 302");
  });
});
