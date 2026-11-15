// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { IMAGERY_CACHE_CONTROL, STORM_CACHE_CONTROL } from "./storm-cache";

const SECONDS = /^(\d+)$/u;

function directive(header: string, name: string): number | undefined {
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === name) {
      const match = SECONDS.exec(value ?? "");
      return match ? Number(match[1]) : undefined;
    }
  }
  return undefined;
}

// Owner decision 15 Nov 2026: Cloudflare keeps these public feeds for about a
// minute, never longer (scripts/production/cloudflare-cache-rules.py).
describe("storm cache headers", () => {
  for (const [name, header] of [
    ["STORM_CACHE_CONTROL", STORM_CACHE_CONTROL],
    ["IMAGERY_CACHE_CONTROL", IMAGERY_CACHE_CONTROL],
  ] as const) {
    it(`${name} is public and fresh at the edge for at most 60 seconds`, () => {
      expect(header.startsWith("public,")).toBe(true);
      expect(header).not.toContain("private");
      expect(directive(header, "s-maxage")).toBe(60);
      expect(directive(header, "stale-while-revalidate")).toBeLessThanOrEqual(
        60
      );
      expect(directive(header, "stale-if-error")).toBe(86_400);
    });
  }

  it("marks every /alerts page cacheable and keeps draft previews uncached", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const alerts = rules.find((rule) => rule.source === "/alerts/:path*");
    expect(alerts?.headers).toEqual([
      { key: "Cache-Control", value: STORM_CACHE_CONTROL },
    ]);
    const preview = rules.find((rule) => rule.source === "/preview");
    expect(preview?.headers).toContainEqual({
      key: "Cache-Control",
      value: "no-store",
    });
  });
});
