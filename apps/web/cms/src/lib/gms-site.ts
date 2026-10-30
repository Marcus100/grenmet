/**
 * Where each published post lives on the weather site. The routes mirror
 * `ROUTES` in `apps/web/gms/src/lib/cms.ts`; a test pins them together.
 * Slugs carry a collection prefix (`updates/`, `stories/`, `reports/`), which
 * the site route does not show.
 */
const SITE_ROUTES = {
  "desk-updates": { prefix: /^updates\//, base: "/explore/updates/" },
  stories: { prefix: /^stories\//, base: "/explore/news/" },
  "report-notes": { prefix: /^reports\//, base: "/explore/reports/" },
} as const;

export type SiteCollection = keyof typeof SITE_ROUTES;

export const isSiteCollection = (value: string): value is SiteCollection =>
  value in SITE_ROUTES;

/** Trailing slashes on a configured origin. */
const TRAILING_SLASHES = /\/+$/;

/** A live post has no page of its own; it shows on the weather site's home page. */
export const LIVE_POST_PATH = "/";

/** The path of a post on the weather site, e.g. `/explore/news/2026/10/x`. */
export function sitePath(collection: SiteCollection, slug: string): string {
  const { prefix, base } = SITE_ROUTES[collection];
  return base + slug.replace(prefix, "");
}

/** An absolute address for a site path, joined to the configured origin. */
export function siteAddress(origin: string, path: string): string {
  return `${origin.replace(TRAILING_SLASHES, "")}${path}`;
}
