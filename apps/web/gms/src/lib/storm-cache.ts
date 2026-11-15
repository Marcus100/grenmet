/**
 * Cache-Control for pages and feeds people need during a storm. Owner
 * decision (15 Nov 2026): Cloudflare may keep these public, same-for-everyone
 * answers for about a minute (`s-maxage=60`), refresh them in the background
 * for at most another minute (`stale-while-revalidate=60`), and serve the last
 * good copy for up to a day only while the origin is failing
 * (`stale-if-error`). Never use these on signed-in or personal responses.
 * Runbook: docs/operations/cloudflare-storm-cache.md.
 */
export const STORM_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=60, stale-if-error=86400";

/** Satellite and other imagery: the same minute at the edge. */
export const IMAGERY_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=60, stale-if-error=86400";
