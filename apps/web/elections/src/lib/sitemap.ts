import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/** Fixed public pages of the elections site. */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/2026",
  "/candidates",
  "/constituencies",
  "/elections",
  "/forecast",
  "/how-close",
  "/learn",
  "/make-your-map",
  "/parties",
  "/referendums",
  "/register",
  "/results",
  "/search",
  "/sources",
  "/trends",
  "/updates",
] as const;

export interface ElectionsSlugs {
  readonly candidateSlugs: readonly string[];
  readonly constituencySlugs: readonly string[];
  readonly electionSlugs: readonly string[];
  readonly guideSlugs: readonly string[];
  readonly partyCodes: readonly string[];
  readonly updateSlugs: readonly string[];
}

/**
 * Every public page of the elections site: the fixed pages plus one page per
 * constituency, candidate, party, election, guide and update. Pure, so the
 * slugs the caller passes in are the same ones the static pages are built from.
 */
export function buildSitemap(
  siteUrl: string,
  slugs: ElectionsSlugs
): { url: string }[] {
  const paths = [
    ...STATIC_PUBLIC_PATHS,
    ...slugs.constituencySlugs.map((slug) => `/constituencies/${slug}`),
    ...slugs.candidateSlugs.map((slug) => `/candidates/${slug}`),
    ...slugs.partyCodes.map((code) => `/parties/${code}`),
    ...slugs.electionSlugs.map((slug) => `/elections/${slug}`),
    ...slugs.guideSlugs.map((slug) => `/learn/${slug}`),
    ...slugs.updateSlugs.map((slug) => `/updates/${slug}`),
  ];
  return [...new Set(paths)].map((path) => ({
    url: absoluteUrl(siteUrl, path),
  }));
}
