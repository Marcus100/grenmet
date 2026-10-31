import { readdirSync } from "node:fs";
import path from "node:path";
import { prefixedLocationParams } from "@/lib/locations";
import { PLANNED_ROUTE_PREFIX } from "@/lib/planned-routes";

/** Node-only helpers for tests that check links against the routes on disk. */
export const APP_DIR = path.resolve(import.meta.dirname, "../app");

/** A folder serves a URL when it holds a page or a route handler. */
const ROUTE_FILE = /^(page\.(tsx|ts|jsx|js)|route\.(ts|js))$/;

/**
 * Every route the app actually serves, as a URL path: pages and route
 * handlers. Route-group segments — `(weather)`, `(pages)` — are directory-only
 * and do not appear in the URL, so they are dropped.
 */
export function routesOnDisk(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = path.join(dir, entry.name);
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    const next = isGroup ? segments : [...segments, entry.name];
    if (readdirSync(child).some((file) => ROUTE_FILE.test(file))) {
      routes.push(`/${next.join("/")}`);
    }
    routes.push(...routesOnDisk(child, next));
  }
  return routes;
}

/** `[id]`, `[...slug]` and the optional catch-all `[[...slug]]`. */
export const DYNAMIC_SEGMENT = /^\[\[?(\.\.\.)?[^\]]+\]\]?$/;
/** `[...slug]` or `[[...slug]]`. */
export const CATCH_ALL = /^\[\[?\.\.\./;
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\./;
/** `[location]` has dynamicParams = false: only enabled place slugs exist. */
const LOCATION_SLUGS = new Set(
  prefixedLocationParams().map((params) => params.location)
);

/**
 * Does a route pattern such as `/alerts/bulletins/[hazard]` serve `href`?
 * The planned-page route is excluded so it cannot vouch for real links.
 */
export function serves(pattern: string, href: string): boolean {
  if (pattern.startsWith(`${PLANNED_ROUTE_PREFIX}/`)) {
    return false;
  }
  return matches(pattern, href);
}

/** Does a route pattern match `href` by its segments, whatever the route is? */
export function matches(pattern: string, href: string): boolean {
  const want = href.split("/").filter(Boolean);
  const have = pattern.split("/").filter(Boolean);
  for (const [i, segment] of have.entries()) {
    if (CATCH_ALL.test(segment)) {
      // An optional catch-all also matches no further segment.
      return OPTIONAL_CATCH_ALL.test(segment)
        ? want.length >= i
        : want.length > i;
    }
    if (want[i] === undefined) {
      return false;
    }
    if (segment === "[location]" && !LOCATION_SLUGS.has(want[i])) {
      return false;
    }
    if (!DYNAMIC_SEGMENT.test(segment) && segment !== want[i]) {
      return false;
    }
  }
  return have.length === want.length;
}
