import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://docs.barrels.gd" },
}));

import robots from "@/app/robots";
import { buildSitemap, PRIVATE_DISALLOW, pagePath } from "./sitemap";

const SITE = "https://docs.barrels.gd";

describe("docs sitemap", () => {
  it("maps the index page to the site root and other pages to their path", () => {
    expect(pagePath("index")).toBe("/");
    expect(pagePath("reports/weekly")).toBe("/reports/weekly");
    expect(pagePath("reports\\weekly")).toBe("/reports/weekly");
  });

  it("lists each content page once on the docs host", () => {
    const urls = buildSitemap(SITE, [
      "index",
      "reports/weekly",
      "reports/weekly",
    ]);
    expect(urls).toEqual([
      { url: `${SITE}/` },
      { url: `${SITE}/reports/weekly` },
    ]);
  });

  it("never lists sign-in, API or runtime endpoints", () => {
    const urls = buildSitemap(SITE, ["index"]).map((entry) => entry.url);
    for (const url of urls) {
      const path = new URL(url).pathname;
      for (const prefix of PRIVATE_DISALLOW) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });
});

describe("docs robots", () => {
  it("disallows the API, sign-in and runtime config and names the docs sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://docs.barrels.gd/sitemap.xml");
    const disallow = (result.rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining(["/api/", "/auth/", "/runtime-env.js"])
    );
  });
});
