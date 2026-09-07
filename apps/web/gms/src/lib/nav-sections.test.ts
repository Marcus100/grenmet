// @vitest-environment node
//
// Node, not jsdom: this walks the app directory on disk to prove every
// navigation link has a route behind it.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV_SECTIONS,
  type NavSection,
  sectionLinks,
} from "@/lib/nav-sections";

const APP_DIR = path.resolve(import.meta.dirname, "../app");

/**
 * Every route the app actually serves, as a URL path. Route-group segments
 * — `(weather)`, `(pages)` — are directory-only and do not appear in the URL,
 * so they are dropped.
 */
function routesOnDisk(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = path.join(dir, entry.name);
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    const next = isGroup ? segments : [...segments, entry.name];
    if (existsSync(path.join(child, "page.tsx"))) {
      routes.push(`/${next.join("/")}`);
    }
    routes.push(...routesOnDisk(child, next));
  }
  return routes;
}

function allLinks(sections: readonly NavSection[]) {
  return sections.flatMap((section) => [
    ...(section.href ? [section.href] : []),
    ...sectionLinks(section).map((link) => link.href),
  ]);
}

describe("NAV_SECTIONS", () => {
  const routes = new Set([...routesOnDisk(APP_DIR), "/"]);

  it.each([...new Set(allLinks(NAV_SECTIONS))])(
    "%s has a page behind it",
    (href) => {
      expect(routes.has(href)).toBe(true);
    }
  );

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
