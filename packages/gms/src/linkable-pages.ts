import { NAV_SECTIONS } from "./nav-sections";

/** One built page of the weather site that a CMS post can point to. */
export interface LinkablePage {
  description: string;
  /** The menu group it sits under, e.g. "Right now". */
  group: string;
  path: string;
  /** The site section, e.g. "Weather". */
  section: string;
  title: string;
}

/**
 * Every built page in the site navigation, so the CMS picker never goes stale:
 * add a page to `NAV_SECTIONS` and editors can link it. Pages marked `planned`
 * are left out. A path listed twice keeps its first entry.
 */
export const LINKABLE_PAGES: LinkablePage[] = (() => {
  const seen = new Set<string>();
  const pages: LinkablePage[] = [];
  const add = (page: LinkablePage) => {
    if (seen.has(page.path)) return;
    seen.add(page.path);
    pages.push(page);
  };
  for (const section of NAV_SECTIONS) {
    add({
      path: section.href,
      title: section.label,
      description: section.blurb,
      section: section.label,
      group: "Section home",
    });
    for (const group of section.groups) {
      for (const link of group.links) {
        if (link.planned) continue;
        add({
          path: link.href,
          title: link.name,
          description: link.description,
          section: section.label,
          group: group.heading,
        });
      }
    }
  }
  return pages;
})();

const BY_PATH = new Map(LINKABLE_PAGES.map((page) => [page.path, page]));

/** The page for a stored path, or undefined if it no longer exists. */
export function linkablePage(path: string): LinkablePage | undefined {
  return BY_PATH.get(path);
}
