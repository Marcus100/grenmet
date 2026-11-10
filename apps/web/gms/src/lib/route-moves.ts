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
  ["/weather/3-day", "/weather/5-day"],
  // No 7-day product exists yet; the page was only a placeholder.
  ["/weather/7-day", "/weather/5-day"],
  ["/products/forecasts", "/weather/issued"],
  ["/products/issued", "/weather/issued"],
  // Product archive moved from Climate to Weather (issue #1168)
  ["/climate/archive", "/weather/archive"],
  // Alerts (renamed from Warnings, 29 Sep 2026)
  ["/warnings/cyclone/archive", "/explore/history/hurricanes"],
  ["/warnings", "/alerts"],
  // The duplicate marine warnings page is gone; the hazard page replaces it.
  // Redirects run before routing, so this wins over `/alerts/[identifier]`.
  ["/alerts/marine", "/alerts/bulletins/marine"],
  // Advisories were never a separate product; the alerts page lists them.
  ["/alerts/advisories", "/alerts"],
  // Past cyclones live in the history page; the archive page was a placeholder.
  ["/alerts/cyclone/archive", "/explore/history/hurricanes"],
  ["/products/bulletins", "/alerts/bulletins"],
  ["/bulletins", "/alerts/bulletins"],
  ["/resources/hurricane-names", "/explore/hurricane-names"],
  ["/resources/hurricane", "/alerts/prepare/hurricane"],
  ["/resources/flood", "/alerts/prepare/flood"],
  ["/resources/warnings-guide", "/alerts/understanding"],
  ["/subscribe", "/alerts/get-alerts"],
  // Marine
  ["/sectors/marine", "/marine"],
  ["/resources/marine-safety", "/marine/safety"],
  // Services (Disaster management, construction, education and media moved to About)
  ["/sectors/aviation", "/services/aviation"],
  ["/aviation", "/services/aviation"],
  ["/sectors", "/services"],
  ["/events", "/services/tourism/events"],
  ["/about/services", "/services"],
  ["/services/disaster-management", "/about/disaster-management"],
  ["/services/construction", "/about/construction"],
  ["/services/education", "/about/education"],
  ["/services/media", "/about/media"],
  ["/media", "/about/media"],
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
