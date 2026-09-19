"use client";

import { usePathname } from "next/navigation";

/** Today is served at both `/` and `/forecasts`; dated routes are other days. */
const TODAY_PATHS = new Set(["/", "/forecasts"]);

export function useIsToday() {
  const pathname = usePathname();
  return TODAY_PATHS.has(pathname);
}
