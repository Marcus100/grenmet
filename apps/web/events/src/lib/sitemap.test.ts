import { describe, expect, it } from "vitest";
import {
  buildSitemap,
  PRIVATE_DISALLOW,
  SITEMAP_EVENT_LIMIT,
  STATIC_PUBLIC_PATHS,
} from "./sitemap";

const SITE = "https://events.barrels.gd";
const PRIVATE_URL = /token|orders|tickets|threads|\?/u;

describe("events sitemap", () => {
  const urls = buildSitemap(SITE, {
    events: [{ slug: "spicemas-parade" }],
    groups: [{ slug: "grenada-runners" }],
  }).map((entry) => entry.url);

  it("lists the fixed public pages on the site's own host", () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(urls).toContain(path === "/" ? `${SITE}/` : `${SITE}${path}`);
    }
    expect(urls.every((url) => url.startsWith(`${SITE}/`))).toBe(true);
  });

  it("lists events and groups by slug", () => {
    expect(urls).toContain(`${SITE}/events/spicemas-parade`);
    expect(urls).toContain(`${SITE}/groups/grenada-runners`);
  });

  it("never lists a private, account or tokenised address", () => {
    for (const url of urls) {
      const path = new URL(url).pathname;
      for (const prefix of PRIVATE_DISALLOW) {
        expect(path.startsWith(prefix)).toBe(false);
      }
      expect(url).not.toMatch(PRIVATE_URL);
    }
  });

  it("caps the event list so a huge listing cannot grow the sitemap without bound", () => {
    const events = Array.from({ length: SITEMAP_EVENT_LIMIT + 50 }, (_, i) => ({
      slug: `event-${i}`,
    }));
    const eventUrls = buildSitemap(SITE, { events, groups: [] }).filter(
      (entry) => entry.url.includes("/events/")
    );
    expect(eventUrls).toHaveLength(SITEMAP_EVENT_LIMIT);
  });
});
