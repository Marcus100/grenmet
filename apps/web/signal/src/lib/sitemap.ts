import { absoluteUrl } from "@barrelsgd/ui/lib/seo";
import { SECTIONS } from "@/lib/nav";

/** Editorial pages that are public. The newsletter status page is not listed. */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/about",
  "/archive",
  "/briefs",
  "/learn",
  "/privacy",
  "/search",
  "/topics",
] as const;

/** Newsletter status pages, sign-in and machine endpoints: never indexed. */
export const PRIVATE_DISALLOW = [
  "/api/",
  "/auth/",
  "/runtime-env.js",
  "/subscribe/status",
] as const;

export interface SitemapArticle {
  readonly publishedAt: string;
  readonly section: string;
  readonly slug: string;
}

export interface SitemapEntry {
  readonly lastModified?: string;
  readonly url: string;
}

/**
 * Every public Signal URL: fixed pages, section indexes, published articles
 * and daily editions. Pure: the caller passes the content it already loaded.
 */
export function buildSitemap(
  siteUrl: string,
  input: {
    readonly articles: readonly SitemapArticle[];
    readonly briefDates: readonly string[];
    readonly collectionSlugs: readonly string[];
  }
): SitemapEntry[] {
  return [
    ...STATIC_PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(siteUrl, path) })),
    ...SECTIONS.map((section) => ({
      url: absoluteUrl(siteUrl, `/${section.slug}`),
    })),
    ...input.collectionSlugs.map((slug) => ({
      url: absoluteUrl(siteUrl, `/collections/${slug}`),
    })),
    ...input.briefDates.map((date) => ({
      url: absoluteUrl(siteUrl, `/today/${date}`),
    })),
    ...input.articles.map((article) => ({
      url: absoluteUrl(siteUrl, `/${article.section}/${article.slug}`),
      lastModified: article.publishedAt,
    })),
  ];
}
