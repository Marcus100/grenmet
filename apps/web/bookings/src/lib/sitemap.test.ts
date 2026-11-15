import { describe, expect, it } from "vitest";
import { buildSitemap, PRIVATE_DISALLOW } from "./sitemap";

const SITE = "https://bookings.barrels.gd";
const PRIVATE_URL = /studio|signin|booking\/|token/u;

describe("bookings sitemap", () => {
  it("lists only the public home page on the bookings host", () => {
    expect(buildSitemap(SITE)).toEqual([
      { url: "https://bookings.barrels.gd/" },
    ]);
  });

  it("never lists studio, sign-in or tokenised booking addresses", () => {
    for (const entry of buildSitemap(SITE)) {
      expect(entry.url).not.toMatch(PRIVATE_URL);
    }
    expect(PRIVATE_DISALLOW).toEqual(
      expect.arrayContaining(["/studio", "/signin", "/*/booking/"])
    );
  });
});
