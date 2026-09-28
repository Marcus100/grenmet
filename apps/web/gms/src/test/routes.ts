import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Node-only helpers for tests that check links against the routes on disk. */
export const APP_DIR = path.resolve(import.meta.dirname, "../app");

/**
 * Every route the app actually serves, as a URL path. Route-group segments
 * — `(weather)`, `(pages)` — are directory-only and do not appear in the URL,
 * so they are dropped.
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
    if (existsSync(path.join(child, "page.tsx"))) {
      routes.push(`/${next.join("/")}`);
    }
    routes.push(...routesOnDisk(child, next));
  }
  return routes;
}

export const DYNAMIC_SEGMENT = /^\[(\.\.\.)?[^\]]+\]$/;
const CATCH_ALL = /^\[\.\.\./;

/**
 * Does a route pattern such as `/warnings/bulletins/[hazard]` serve `href`?
 * The planned-page catch-all is excluded so it cannot vouch for real links.
 */
export function serves(pattern: string, href: string): boolean {
  const want = href.split("/").filter(Boolean);
  const have = pattern.split("/").filter(Boolean);
  if (have[0] === "[...planned]") {
    return false;
  }
  for (const [i, segment] of have.entries()) {
    if (CATCH_ALL.test(segment)) {
      return want.length > i;
    }
    if (want[i] === undefined) {
      return false;
    }
    if (!DYNAMIC_SEGMENT.test(segment) && segment !== want[i]) {
      return false;
    }
  }
  return have.length === want.length;
}
