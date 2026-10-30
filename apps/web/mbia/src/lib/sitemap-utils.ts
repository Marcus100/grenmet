import type { PageDoc } from "@/lib/content-utils";
import { SECTIONS } from "@/lib/nav";

const TRAILING_SLASHES = /\/+$/u;

/** Hand-built routes that are not MDX pages (see AGENTS.md "Content model & routes"). */
export const STATIC_ROUTES = [
  "/",
  "/flights",
  "/airports",
  "/airports/mbia",
  "/airports/lauriston",
  "/airports/pearls",
  "/contact",
  "/privacy",
] as const;

export interface SitemapEntry {
  lastModified?: string;
  url: string;
}

/**
 * Every public route: the static pages, one index per content section and one
 * entry per published (non-draft) MDX page. Pure so tests need no generated module.
 */
export function buildSitemap(
  pages: PageDoc[],
  siteUrl: string
): SitemapEntry[] {
  const base = siteUrl.replace(TRAILING_SLASHES, "");
  const entries: SitemapEntry[] = [
    ...STATIC_ROUTES.map((path) => ({
      url: path === "/" ? base : `${base}${path}`,
    })),
    ...SECTIONS.map((section) => ({ url: `${base}/${section}` })),
  ];
  for (const page of pages) {
    if (page.draft) {
      continue;
    }
    entries.push({
      url: `${base}/${page.section}/${page.slug}`,
      ...(page.publishedAt ? { lastModified: page.publishedAt } : {}),
    });
  }
  return entries;
}
