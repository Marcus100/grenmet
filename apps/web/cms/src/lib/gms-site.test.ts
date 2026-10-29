import { describe, expect, it } from "vitest";
import { siteAddress, sitePath } from "./gms-site";

/**
 * These are the weather site's routes for each post collection, copied from
 * `ROUTES` in apps/web/gms/src/lib/cms.ts. If one changes, both must.
 */
describe("post addresses on the weather site", () => {
  it("maps each collection's slug to the route the weather site serves", () => {
    expect(sitePath("desk-updates", "updates/2026/10/preparing")).toBe(
      "/explore/updates/2026/10/preparing"
    );
    expect(sitePath("stories", "stories/2026/10/heavy-rain")).toBe(
      "/explore/news/2026/10/heavy-rain"
    );
    expect(sitePath("report-notes", "reports/2026/10/tropical-report")).toBe(
      "/explore/reports/2026/10/tropical-report"
    );
  });

  it("joins the configured origin without a doubled slash", () => {
    expect(
      siteAddress("https://weather.example.test/", "/explore/news/x")
    ).toBe("https://weather.example.test/explore/news/x");
    expect(siteAddress("https://weather.example.test", "/")).toBe(
      "https://weather.example.test/"
    );
  });
});
