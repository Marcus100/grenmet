import { linkablePage } from "./linkable-pages";

export type LinkType = "product" | "cap" | "page" | "link";

/** What a pasted link points at; `ref` is the id, identifier or site path. */
export interface RecognizedLink {
  ref: string | null;
  type: LinkType;
}

/** Hosts that serve the GMS weather site, so a pasted address can be read. */
const SITE_HOSTS = new Set([
  "weather.barrels.gd",
  "weather.staging.barrels.gd",
  "weather.gd",
  "www.weather.gd",
  "localhost:3003",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUED = /^\/weather\/issued\/([^/]+)$/;
const ALERT = /^\/alerts\/([^/]+)$/;
const QUERY_OR_HASH = /[?#]/;

/** Drops trailing slashes with a loop, not a backtracking pattern. */
function trimTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 1 && path.charAt(end - 1) === "/") end -= 1;
  return path.slice(0, end);
}

/** The site path of a pasted address, or null for an outside link. */
export function sitePath(input: string): string | null {
  const raw = input.trim();
  let path: string | null = null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    path = raw.split(QUERY_OR_HASH)[0] ?? raw;
  } else if (URL.canParse(raw)) {
    const url = new URL(raw);
    if (SITE_HOSTS.has(url.host)) path = url.pathname;
  }
  if (path === null) return null;
  return trimTrailingSlashes(path);
}

/**
 * Reads a pasted address: an issued product (live card), a warning (live
 * card), any other GMS page (page card) or an outside link (plain link).
 */
export function recognizeLink(input: string): RecognizedLink {
  const path = sitePath(input);
  if (path === null) return { type: "link", ref: null };
  const issued = path.match(ISSUED)?.[1];
  if (issued && UUID.test(issued))
    return { type: "product", ref: issued.toLowerCase() };
  if (linkablePage(path)) return { type: "page", ref: path };
  const alert = path.match(ALERT)?.[1];
  if (alert) {
    try {
      return { type: "cap", ref: decodeURIComponent(alert) };
    } catch {
      return { type: "link", ref: null };
    }
  }
  return { type: "page", ref: path };
}
