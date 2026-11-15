import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://cap.barrels.gd" },
}));

import robots from "@/app/robots";
import { buildSitemap, PRIVATE_DISALLOW, SITEMAP_ALERT_LIMIT } from "./sitemap";

const SITE = "https://cap.barrels.gd";

describe("cap sitemap", () => {
  it("lists the public pages and one page per alert, on the cap host", () => {
    const urls = buildSitemap(SITE, ["2.49.0.0.308.0.VC.20261116"]).map(
      (entry) => entry.url
    );
    expect(urls).toContain(`${SITE}/`);
    expect(urls).toContain(`${SITE}/history`);
    expect(urls).toContain(`${SITE}/alerts/2.49.0.0.308.0.VC.20261116`);
    expect(urls.every((url) => url.startsWith(`${SITE}/`))).toBe(true);
  });

  it("never lists the desk, sign-in or machine endpoints", () => {
    const urls = buildSitemap(SITE, ["id-1"]).map((entry) => entry.url);
    for (const url of urls) {
      const path = new URL(url).pathname;
      for (const prefix of PRIVATE_DISALLOW) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("de-duplicates identifiers and caps the alert list", () => {
    const many = Array.from(
      { length: SITEMAP_ALERT_LIMIT + 20 },
      (_, i) => `alert-${i}`
    );
    const urls = buildSitemap(SITE, [...many, "alert-0"]).filter((entry) =>
      entry.url.includes("/alerts/")
    );
    expect(urls).toHaveLength(SITEMAP_ALERT_LIMIT);
  });

  it("encodes identifiers so they cannot change the path", () => {
    const [entry] = buildSitemap(SITE, ["a/b?c"]).filter((item) =>
      item.url.includes("/alerts/")
    );
    expect(entry?.url).toBe(`${SITE}/alerts/a%2Fb%3Fc`);
  });
});

describe("cap robots", () => {
  it("disallows the desk and names the sitemap on the cap host", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://cap.barrels.gd/sitemap.xml");
    const disallow = (result.rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining(["/desk", "/api/", "/auth/"])
    );
  });
});
