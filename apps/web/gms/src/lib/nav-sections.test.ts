// @vitest-environment node
//
// Node, not jsdom: this walks the app directory on disk to prove every
// navigation link has a route behind it.
import { describe, expect, it } from "vitest";
import {
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

  it("gives every link a name and a description", () => {
    for (const section of NAV_SECTIONS) {
      for (const link of sectionLinks(section)) {
        expect(link.name.length).toBeGreaterThan(0);
        expect(link.description.length).toBeGreaterThan(0);
      }
    }
  });
});
