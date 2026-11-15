import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://signal.barrels.gd" },
}));

import robots from "@/app/robots";
import { buildSitemap, PRIVATE_DISALLOW, STATIC_PUBLIC_PATHS } from "./sitemap";

const SITE = "https://signal.barrels.gd";

const urls = buildSitemap(SITE, {
  articles: [
    { section: "sport", slug: "carib-cup", publishedAt: "2026-06-13" },
  ],
  briefDates: ["2026-06-13"],
  collectionSlugs: ["october-in-grenada"],
}).map((entry) => entry.url);

describe("signal sitemap", () => {
  it("lists the public pages, sections, articles, collections and daily editions", () => {
    expect(urls).toContain(`${SITE}/`);
    expect(urls).toContain(`${SITE}/briefs`);
    expect(urls).toContain(`${SITE}/sport`);
    expect(urls).toContain(`${SITE}/sport/carib-cup`);
    expect(urls).toContain(`${SITE}/today/2026-06-13`);
    expect(urls).toContain(`${SITE}/collections/october-in-grenada`);
  });

  it("keeps every entry on the signal host and off private paths", () => {
    for (const url of urls) {
      expect(url.startsWith(`${SITE}/`)).toBe(true);
      const path = new URL(url).pathname;
      for (const prefix of PRIVATE_DISALLOW) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("does not list the newsletter status page", () => {
    expect(urls).not.toContain(`${SITE}/subscribe/status`);
    expect(STATIC_PUBLIC_PATHS).not.toContain("/subscribe/status");
  });
});

describe("signal robots", () => {
  it("disallows the status and machine paths and names the sitemap on the signal host", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://signal.barrels.gd/sitemap.xml");
    const disallow = (result.rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining(["/subscribe/status", "/api/", "/auth/"])
    );
    expect((result.rules as { allow: string }).allow).toBe("/");
  });
});
