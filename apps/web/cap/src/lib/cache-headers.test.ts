// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

interface Rule {
  headers: { key: string; value: string }[];
  source: string;
}

/** The Cache-Control and robots values Next would send for a path. */
async function headersFor(path: string) {
  const rules = (await nextConfig.headers?.()) as Rule[];
  const found = new Map<string, string>();
  for (const rule of rules) {
    // The rules use path-to-regexp syntax; these sources are plain regex plus
    // `:path*`, so translate only the latter.
    const pattern = rule.source.replace("/:path*", "(?:/.*)?");
    if (new RegExp(`^${pattern}$`).test(path)) {
      for (const { key, value } of rule.headers) found.set(key, value);
    }
  }
  return found;
}

describe("cache headers on the shared cap host", () => {
  it.each(["/", "/map", "/history", "/alerts/abc", "/feeds", "/about"])(
    "public page %s keeps the edge cache",
    async (path) => {
      const headers = await headersFor(path);
      expect(headers.get("Cache-Control")).toContain("s-maxage=60");
      expect(headers.has("X-Robots-Tag")).toBe(false);
    }
  );

  it.each([
    "/desk",
    "/desk/",
    "/desk/signin",
    "/desk/alerts/abc/edit",
    "/auth/start",
    "/auth/callback",
  ])("staff path %s is never stored and not indexed", async (path) => {
    const headers = await headersFor(path);
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
