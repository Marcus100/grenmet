import { plannedPaths } from "@barrelsgd/gms/nav-sections";

/**
 * Planned placeholder pages are served from `app/(planned)/planned/[...planned]`
 * and reached by a rewrite from each planned link's own address.
 *
 * The catch-all must not sit at the site root: there it caught every unknown
 * URL and threw `notFound()` while the page rendered on the server, and Next
 * then sends an empty error document (`<html id="__next_error__">`) that only
 * fills in once the browser runs JavaScript. Under this prefix an unknown URL
 * matches no page, so Next answers with the not-found page rendered on the
 * server, status 404.
 */
export const PLANNED_ROUTE_PREFIX = "/planned";

/** One rewrite per planned link, from its public address to the placeholder route. */
export function plannedRewrites(): { destination: string; source: string }[] {
  return plannedPaths().map((href) => ({
    source: href,
    destination: `${PLANNED_ROUTE_PREFIX}${href}`,
  }));
}
