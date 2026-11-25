import { describe, expect, it } from "vitest";
import { metadata as homeMetadata } from "@/app/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/data/site";

// The client's own domain is the official address (25 Nov 2026): search engines and
// shared links must name it, also when the site is opened on babydoll.barrels.gd.
describe("official address", () => {
  it("is the client's domain", () => {
    expect(SITE_URL).toBe("https://babydollbeautybar.com");
  });

  it("is used by the sitemap and robots", () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith(`${SITE_URL}/`)).toBe(true);
    }
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("gives the home page a canonical", () => {
    expect(homeMetadata.alternates?.canonical).toBe("/");
  });
});
