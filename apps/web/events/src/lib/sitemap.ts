import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/** Public pages that do not come from the API. Private segments are never listed. */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/events",
  "/groups",
  "/season/spicemas",
  "/privacy",
] as const;

/** Upper bounds so a huge listing can never produce an oversized sitemap. */
export const SITEMAP_EVENT_LIMIT = 200;
export const SITEMAP_GROUP_LIMIT = 200;

export interface SitemapEntry {
  readonly url: string;
}

/**
 * The public URLs of Barrels Events: the fixed pages plus one entry per
 * upcoming event and per group. Pure, so the tests need no API.
 */
export function buildSitemap(
  siteUrl: string,
  input: {
    readonly events: readonly { readonly slug: string }[];
    readonly groups: readonly { readonly slug: string }[];
  }
): SitemapEntry[] {
  return [
    ...STATIC_PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(siteUrl, path) })),
    ...input.events
      .slice(0, SITEMAP_EVENT_LIMIT)
      .map((event) => ({ url: absoluteUrl(siteUrl, `/events/${event.slug}`) })),
    ...input.groups
      .slice(0, SITEMAP_GROUP_LIMIT)
      .map((group) => ({ url: absoluteUrl(siteUrl, `/groups/${group.slug}`) })),
  ];
}

/** Private segments: account, orders, tickets, messages, dashboards and sign-in. */
export const PRIVATE_DISALLOW = [
  "/api/",
  "/auth/",
  "/dash",
  "/me",
  "/messages",
  "/network",
  "/runtime-env.js",
  "/sign-in",
  "/welcome",
] as const;
