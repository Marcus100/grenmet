import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://elections.barrels.gd" },
}));

import robots from "@/app/robots";
import { buildSitemap, STATIC_PUBLIC_PATHS } from "./sitemap";

const SITE = "https://elections.barrels.gd";

const slugs = {
  candidateSlugs: ["jane-doe"],
  constituencySlugs: ["st-george-north"],
  electionSlugs: ["general-2022"],
  guideSlugs: ["how-counting-works"],
  partyCodes: ["ndc"],
  updateSlugs: ["week-one"],
};

describe("elections sitemap", () => {
  const urls = buildSitemap(SITE, slugs).map((entry) => entry.url);

  it("lists the fixed pages and one page per generated slug", () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(urls).toContain(path === "/" ? `${SITE}/` : `${SITE}${path}`);
    }
    expect(urls).toContain(`${SITE}/constituencies/st-george-north`);
    expect(urls).toContain(`${SITE}/candidates/jane-doe`);
    expect(urls).toContain(`${SITE}/parties/ndc`);
    expect(urls).toContain(`${SITE}/elections/general-2022`);
    expect(urls).toContain(`${SITE}/learn/how-counting-works`);
    expect(urls).toContain(`${SITE}/updates/week-one`);
  });

  it("de-duplicates and stays on the elections host", () => {
    const doubled = buildSitemap(SITE, {
      ...slugs,
      constituencySlugs: ["st-george-north", "st-george-north"],
    }).map((entry) => entry.url);
    expect(new Set(doubled).size).toBe(doubled.length);
    expect(doubled.every((url) => url.startsWith(`${SITE}/`))).toBe(true);
  });
});

describe("elections robots", () => {
  it("allows every page and names the sitemap on the elections host", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://elections.barrels.gd/sitemap.xml");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });
});
