"use client";

import { usePathname } from "next/navigation";

/** Today is served at both `/` and `/forecasts`; dated routes are other days. */
const TODAY_PATHS = new Set(["/", "/forecasts"]);

/**
 * Current conditions describe right now, so they belong only on today's view —
 * a dated forecast page must never show them beside another day's numbers.
 */
export function TodayOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return TODAY_PATHS.has(pathname) ? children : null;
}
