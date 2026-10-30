import { FOOTER_GROUP, NAV_SECTIONS, sectionLinks } from "@/lib/nav-sections";

/**
 * Pages that stay out of search results whatever the navigation lists: the
 * signed draft preview and the newsletter preferences page (both `noindex`).
 */
const NOT_INDEXED = new Set(["/preview", "/climate/newsletter/preferences"]);

/**
 * Every public page the sitemap lists: the home page, each section root and
 * every built navigation link, including the footer group. Planned links are
 * placeholders, so they stay out.
 */
export function sitemapPaths(): string[] {
  const links = [
    ...NAV_SECTIONS.flatMap((section) => [
      { href: section.href, planned: false },
      ...sectionLinks(section),
    ]),
    ...FOOTER_GROUP.links,
  ];
  const paths = new Set<string>(["/"]);
  for (const link of links) {
    if (!(link.planned || NOT_INDEXED.has(link.href))) {
      paths.add(link.href);
    }
  }
  return [...paths];
}
