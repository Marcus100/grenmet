// @vitest-environment node
//
// Node, not jsdom: checks each listed path against the routes on disk.
import { describe, expect, it } from "vitest";
import { FOOTER_GROUP, NAV_SECTIONS, plannedPaths } from "@/lib/nav-sections";
import { sitemapPaths } from "@/lib/sitemap-paths";
import { APP_DIR, routesOnDisk, serves } from "@/test/routes";

const paths = sitemapPaths();
const routes = [...routesOnDisk(APP_DIR), "/"];

describe("sitemapPaths", () => {
  it("lists the home page, every section root and every built link once", () => {
    expect(paths).toContain("/");
    for (const section of NAV_SECTIONS) {
      expect(paths).toContain(section.href);
    }
    for (const link of FOOTER_GROUP.links) {
      expect(paths).toContain(link.href);
    }
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("leaves out planned placeholders and the pages that must not be indexed", () => {
    for (const planned of plannedPaths()) {
      expect(paths).not.toContain(planned);
    }
    expect(paths).not.toContain("/preview");
    expect(paths).not.toContain("/climate/newsletter/preferences");
  });

  it.each(paths)("%s has a page behind it", (path) => {
    expect(routes.some((route) => serves(route, path))).toBe(true);
  });
});
