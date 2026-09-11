import "server-only";

import { cache } from "react";
import { loadDashboard } from "@/components/hr/dashboard/load-dashboard";
import { listPublishedProducts } from "@/db/wxproducts/authored-queries";
import { getImagesByDateAndSynoptic } from "@/db/wxwatch/queries";
import { getLatestActiveAlerts } from "@/lib/cap-api";
import { getTodayUTC } from "@/lib/wxwatch/utils";

/** Every home panel loads independently: one dead source degrades to a notice
 *  in its own card instead of taking the operations dashboard down. */
export type Loaded<T> = { data: T; ok: true } | { message: string; ok: false };

async function attempt<T>(
  load: () => Promise<T>,
  message: string
): Promise<Loaded<T>> {
  try {
    return { data: await load(), ok: true };
  } catch {
    return { message, ok: false };
  }
}

// `cache` dedupes per request, so the status strip and the panel below it share
// a single round trip to each source.
export const loadAlerts = cache(() =>
  attempt(() => getLatestActiveAlerts(), "CAP feed unavailable")
);

export const loadProducts = cache(() =>
  attempt(() => listPublishedProducts(), "wxproducts database unavailable")
);

export const loadImagery = cache(() =>
  attempt(
    () => getImagesByDateAndSynoptic(getTodayUTC()),
    "WxWatch database unavailable"
  )
);

export const loadHr = cache(() =>
  attempt(() => loadDashboard(), "HR records unavailable")
);
