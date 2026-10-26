// @vitest-environment node
//
// Node, not jsdom: this walks the app directory on disk. Every page must name
// itself, so the browser title reads "<Page> | Grenada Meteorological Service"
// through the root layout's `title.template`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { plannedPaths } from "@/lib/nav-sections";
import { SITE_NAME } from "@/lib/site-name";
import { APP_DIR } from "@/test/routes";

/** The home page takes the root default title, the site name alone. */
const HOME_FILE = path.join(APP_DIR, "(weather)", "page.tsx");

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return pageFiles(child);
    }
    return entry.name === "page.tsx" ? [child] : [];
  });
}

const PAGES = pageFiles(APP_DIR);
const TEMPLATE = /template: `%s \| \$\{SITE_NAME\}`/;
const DEFAULT_TITLE = /default: SITE_NAME/;
const HAS_METADATA = /export const metadata|generateMetadata/;
const TITLE_VALUE = /title:\s*"([^"]*)"/g;

describe("page titles", () => {
  it("has a root title template ending in the site name", () => {
    const layout = readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");
    expect(layout).toMatch(TEMPLATE);
    expect(layout).toMatch(DEFAULT_TITLE);
    expect(SITE_NAME).toBe("Grenada Meteorological Service");
  });

  it.each(PAGES.map((file) => [path.relative(APP_DIR, file), file] as const))(
    "%s names itself, or is the home page",
    (_name, file) => {
      if (file === HOME_FILE) {
        return;
      }
      const source = readFileSync(file, "utf8");
      // Own `metadata`, its own `generateMetadata`, or a re-export of one.
      expect(source).toMatch(HAS_METADATA);
    }
  );

  it.each(PAGES.map((file) => [path.relative(APP_DIR, file), file] as const))(
    "%s does not repeat the site name in its own title",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      const titles = [...source.matchAll(TITLE_VALUE)].map(
        (match) => match[1] ?? ""
      );
      for (const title of titles) {
        expect(title).not.toContain(" | ");
        expect(title).not.toBe(SITE_NAME);
      }
    }
  );

  it("titles the tropics page as the Tropical Weather Outlook", () => {
    const source = readFileSync(
      path.join(APP_DIR, "(pages)", "weather", "tropics", "page.tsx"),
      "utf8"
    );
    const titles = [...source.matchAll(TITLE_VALUE)].map((match) => match[1]);
    expect(titles[0]).toBe("Tropical Weather Outlook");
    // Through the root template: the full browser title.
    expect(`${titles[0]} | ${SITE_NAME}`).toBe(
      "Tropical Weather Outlook | Grenada Meteorological Service"
    );
    expect(source).not.toContain("NHC Products");
  });

  it("gives planned placeholder pages their link name as the title", () => {
    expect(plannedPaths().length).toBeGreaterThan(0);
    const planned = readFileSync(
      path.join(APP_DIR, "(pages)", "[...planned]", "page.tsx"),
      "utf8"
    );
    expect(planned).toContain("title: page.link.name");
  });
});
