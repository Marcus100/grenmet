import { locationBySlug } from "@/lib/locations";

/**
 * Every one-word address the site serves besides a place (`/carriacou`). The
 * `[location]` page would answer any other one-word address with 200, because
 * the loading boundaries above it have already begun the response when it
 * calls notFound(). The proxy uses this list to answer 404 first. A test keeps
 * it equal to the pages on disk.
 */
export const TOP_LEVEL_ROUTES: readonly string[] = [
  "about",
  "accessibility",
  "alerts",
  "api",
  "app-guide",
  "climate",
  "disclaimer",
  "explore",
  "help",
  "marine",
  "plan-your-week",
  "planned",
  "preview",
  "privacy",
  "services",
  "sitemap",
  "weather",
];

/**
 * True for `/word` that is neither a page, nor an enabled place, nor a file
 * (a dot). Deeper paths and the home page are not this proxy's business.
 */
export function isUnknownOneWordPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const [word] = segments;
  if (segments.length !== 1 || word === undefined || word.includes(".")) {
    return false;
  }
  return !(TOP_LEVEL_ROUTES.includes(word) || locationBySlug(word));
}
