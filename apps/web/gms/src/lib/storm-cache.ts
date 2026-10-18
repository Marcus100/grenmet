/**
 * Cache-Control for pages and feeds people need during a storm. A CDN
 * (Cloudflare) serves the last good copy for up to a day when the origin is
 * down (`stale-if-error`), and refreshes in the background when it is up
 * (`s-maxage` + `stale-while-revalidate`). Runbook:
 * docs/operations/cloudflare-storm-cache.md.
 */
export const STORM_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400";

/** Satellite and other imagery: refreshed more slowly, shorter stale window. */
export const IMAGERY_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400";
