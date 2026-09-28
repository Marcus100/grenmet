/**
 * Bold sky IA migration (28 Sep 2026): every page lives under its section's
 * URL root. Each entry is an old path prefix and its new home; the old prefix
 * and everything under it redirects permanently (308). `next.config.ts` builds
 * the redirects from this list and `route-moves.test.ts` checks that no old
 * route is still served and that every destination has a page.
 *
 * Order matters: a more specific prefix must come before a shorter one that
 * contains it (`/sectors/aviation` before `/sectors`).
 */
export const ROUTE_MOVES: readonly (readonly [from: string, to: string])[] = [
  // Weather
  ["/forecasts", "/weather"],
  ["/observations", "/weather/observations"],
  ["/almanac", "/weather/sun-and-sky"],
  ["/products/nhc", "/weather/tropics"],
  ["/products/forecasts", "/weather/issued"],
  ["/products/issued", "/weather/issued"],
  // Warnings
  ["/products/bulletins", "/warnings/bulletins"],
  ["/bulletins", "/warnings/bulletins"],
  ["/resources/hurricane-names", "/explore/hurricane-names"],
  ["/resources/hurricane", "/warnings/prepare/hurricane"],
  ["/resources/flood", "/warnings/prepare/flood"],
  ["/resources/warnings-guide", "/warnings/understanding"],
  ["/subscribe", "/warnings/get-alerts"],
  // Marine
  ["/sectors/marine", "/marine"],
  ["/resources/marine-safety", "/marine/safety"],
  // Services
  ["/sectors/aviation", "/services/aviation"],
  ["/aviation", "/services/aviation"],
  ["/sectors", "/services"],
  ["/events", "/services/tourism/events"],
  ["/media", "/services/media"],
  // Learn & Explore
  ["/resources/articles", "/explore/explained"],
  ["/resources", "/explore"],
  ["/news", "/explore/news"],
  ["/updates", "/explore/updates"],
  // About
  ["/regional", "/about/regional"],
];

/** Where an old internal path now lives, or the path itself if it did not move. */
export function movedPath(path: string): string {
  for (const [from, to] of ROUTE_MOVES) {
    if (path === from || path.startsWith(`${from}/`)) {
      return `${to}${path.slice(from.length)}`;
    }
  }
  return path;
}

/** Next.js redirect entries: the bare prefix and everything beneath it. */
export function routeMoveRedirects() {
  return ROUTE_MOVES.flatMap(([from, to]) => [
    { source: from, destination: to, permanent: true },
    { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: true },
  ]);
}
