// @vitest-environment node
//
// Node, not jsdom: this walks the app directory on disk to prove every
// navigation link has a route behind it.
import { describe, expect, it } from "vitest";
import {
  FOOTER_GROUP,
  FOOTER_GROUP_SECTION,
  NAV_SECTIONS,
  type NavSection,
  plannedPaths,
  sectionLinks,
} from "@/lib/nav-sections";
import { APP_DIR, routesOnDisk, serves } from "@/test/routes";

function builtLinks(sections: readonly NavSection[]) {
  return sections.flatMap((section) => [
    section.href,
    ...sectionLinks(section)
      .filter((link) => !link.planned)
      .map((link) => link.href),
  ]);
}

describe("NAV_SECTIONS", () => {
  const routes = [...routesOnDisk(APP_DIR), "/"];

  it.each([...new Set(builtLinks(NAV_SECTIONS))])(
    "%s has a page behind it",
    (href) => {
      expect(routes.some((route) => serves(route, href))).toBe(true);
    }
  );

  // A planned link must not shadow a real page or be swallowed by another
  // dynamic route — otherwise the placeholder would never render.
  it.each(plannedPaths())(
    "planned %s is not served by a real route",
    (href) => {
      expect(routes.filter((route) => serves(route, href))).toEqual([]);
    }
  );

  // The footer's About this site group is not in the menu, but its pages must
  // have a route and appear in the sitemap, which is where breadcrumbs point.
  it.each(FOOTER_GROUP.links.map((link) => link.href))(
    "footer %s has a page behind it",
    (href) => {
      expect(routes.some((route) => serves(route, href))).toBe(true);
    }
  );

  it("lists the footer group in the About section on the sitemap", () => {
    const about = NAV_SECTIONS.find(
      (section) => section.href === FOOTER_GROUP_SECTION
    );
    expect(about).toBeDefined();
    expect(FOOTER_GROUP.links.map((link) => link.href)).toEqual([
      "/privacy",
      "/sitemap",
      "/disclaimer",
    ]);
  });

  it("has no duplicate hrefs across the whole menu", () => {
    const hrefs = NAV_SECTIONS.flatMap((section) =>
      sectionLinks(section).map((link) => link.href)
    );
    const planned = plannedPaths();
    expect(new Set(planned).size).toBe(planned.length);
    expect(hrefs.filter((href) => planned.includes(href))).toEqual(planned);
  });

  it("has no duplicate hrefs within a single group", () => {
    for (const section of NAV_SECTIONS) {
      for (const group of section.groups) {
        const hrefs = group.links.map((link) => link.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
      }
    }
  });

  it("lists the Tropical Weather Outlook with the Weather forecasts", () => {
    const weather = NAV_SECTIONS.find((section) => section.href === "/weather");
    const group = (heading: string) =>
      weather?.groups
        .find((entry) => entry.heading === heading)
        ?.links.map((link) => link.href) ?? [];
    expect(group("Forecasts")).toContain("/weather/tropics");
    expect(group("Tropical weather")).not.toContain("/weather/tropics");
    expect(group("Tropical weather")).toEqual([
      "/weather/tropics/waves",
      "/weather/tropics/season",
    ]);
  });

  it("gives every link a name and a description", () => {
    for (const section of NAV_SECTIONS) {
      for (const link of sectionLinks(section)) {
        expect(link.name.length).toBeGreaterThan(0);
        expect(link.description.length).toBeGreaterThan(0);
      }
    }
  });
});
