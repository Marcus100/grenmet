// @vitest-environment node
//
// Node, not jsdom: this walks the app directory on disk to prove every
// navigation link has a route behind it.
import { describe, expect, it } from "vitest";
import {
  FOOTER_GROUP,
  FOOTER_GROUP_SECTION,
  isComing,
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

  it("uses the owner's names for the alert products and the climate bulletin", () => {
    const names = (label: string) =>
      sectionLinks(
        NAV_SECTIONS.find((section) => section.label === label) as NavSection
      ).map((link) => [link.name, link.href]);
    // Green-level hazard products are "GMS alerts"; Plan your week sits under Alerts.
    expect(names("Alerts")).toContainEqual([
      "All GMS alerts",
      "/alerts/bulletins",
    ]);
    expect(names("Alerts")).toContainEqual([
      "Plan your week",
      "/plan-your-week",
    ]);
    expect(names("Weather").map(([, href]) => href)).not.toContain(
      "/plan-your-week"
    );
    expect(names("Climate")).toContainEqual([
      "Climate Bulletin",
      "/climate/monthly",
    ]);
    expect(names("Alerts").map(([name]) => name)).not.toContain(
      "All bulletins"
    );
  });

  it("drops the retired alert pages and keeps them out of the menu", () => {
    const hrefs = NAV_SECTIONS.flatMap((section) =>
      sectionLinks(section).map((link) => link.href)
    );
    for (const retired of [
      "/alerts/advisories",
      "/alerts/marine",
      "/alerts/cyclone/archive",
      "/about/services",
    ]) {
      expect(hrefs).not.toContain(retired);
    }
  });

  it("keeps the alert menu in the owner's order", () => {
    const alerts = NAV_SECTIONS.find((section) => section.label === "Alerts");
    expect(alerts?.groups.map((group) => group.heading)).toEqual([
      "In effect",
      "By hazard",
      "GMS alerts",
      "How alerts work",
      "Prepare",
      "Get alerts",
    ]);
    expect(alerts?.groups[0]?.links.map((link) => link.href)).toEqual([
      "/alerts",
      "/plan-your-week",
      "/alerts/past",
    ]);
  });

  it("moves disaster management, construction, education and media to About", () => {
    const groupLinks = (label: string) =>
      NAV_SECTIONS.find((section) => section.label === label)?.groups.flatMap(
        (group) => group.links.map((link) => link.href)
      ) ?? [];
    for (const href of [
      "/about/disaster-management",
      "/about/construction",
      "/about/education",
      "/about/media",
    ]) {
      expect(groupLinks("About")).toContain(href);
      expect(groupLinks("Services")).not.toContain(href);
    }
  });

  it("lists the product archive under Weather, not Climate", () => {
    const weather = NAV_SECTIONS.find((section) => section.label === "Weather");
    const climate = NAV_SECTIONS.find((section) => section.label === "Climate");
    expect(
      sectionLinks(weather as NavSection).map((link) => link.href)
    ).toContain("/weather/archive");
    expect(
      sectionLinks(climate as NavSection).map((link) => link.href)
    ).not.toContain("/climate/archive");
  });

  it("marks placeholder-only pages Coming without changing their route", () => {
    const coming = NAV_SECTIONS.flatMap((section) =>
      sectionLinks(section).filter((link) => link.coming)
    );
    expect(coming.length).toBeGreaterThan(40);
    for (const link of coming) {
      expect(link.planned).toBeFalsy();
      expect(isComing(link)).toBe(true);
    }
  });
});
