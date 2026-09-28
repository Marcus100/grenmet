"use client";

import { usePathname } from "next/navigation";

/** Today is served at both `/` and `/weather`; dated routes are other days. */
const TODAY_PATHS = new Set(["/", "/weather"]);

export function useIsToday() {
  const pathname = usePathname();
  return TODAY_PATHS.has(pathname);
}
