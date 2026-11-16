import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/** Public pages of the alert hub. The staff desk and sign-in are never listed. */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/about",
  "/feeds",
  "/history",
  "/map",
] as const;

/** Staff warning desk, its sign-in, machine endpoints: never indexed. */
export const PRIVATE_DISALLOW = [
  "/api/",
  "/auth/",
  "/desk",
  "/runtime-env.js",
] as const;

/** Upper bound on alert pages in the sitemap. */
export const SITEMAP_ALERT_LIMIT = 500;

/**
 * Public URLs of the alert hub: fixed pages plus one page per published alert
 * identifier (current and past). Identifiers are unique and capped.
 */
export function buildSitemap(
  siteUrl: string,
  alertIdentifiers: readonly string[]
): { url: string }[] {
  const unique = [...new Set(alertIdentifiers)].slice(0, SITEMAP_ALERT_LIMIT);
  return [
    ...STATIC_PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(siteUrl, path) })),
    ...unique.map((identifier) => ({
      url: absoluteUrl(siteUrl, `/alerts/${encodeURIComponent(identifier)}`),
    })),
  ];
}
