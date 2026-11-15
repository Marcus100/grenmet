import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/**
 * Public pages. Business booking pages (`/<slug>`) are not listed yet: the
 * public API has no list of published businesses to build them from. Adding
 * that endpoint is an API change (the api-engineer), then this list grows.
 */
export const STATIC_PUBLIC_PATHS = ["/"] as const;

/** Staff area, sign-in, personal booking pages and machine endpoints: never indexed. */
export const PRIVATE_DISALLOW = [
  "/api/",
  "/auth/",
  "/runtime-env.js",
  "/signin",
  "/studio",
  "/*/booking/",
] as const;

export function buildSitemap(siteUrl: string): { url: string }[] {
  return STATIC_PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(siteUrl, path),
  }));
}
