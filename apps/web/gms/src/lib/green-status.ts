import "server-only";

import { cache } from "react";
import { fetchActiveAlerts } from "@/lib/cap";
import type { GreenStatus } from "@/lib/cap-alerts";
import { type GreenAlerts, greenAlerts, greenStatus } from "@/lib/green-alerts";
import { fetchSectorOutlook } from "@/lib/products";
import { reportError } from "@/lib/report-error";

/**
 * The GMS items in effect, read once per request. It never rejects: if the
 * outlook cannot be read or interpreted, the answer is `unavailable`, which
 * every surface shows as "cannot be retrieved", never as an all-clear.
 * Kept separate from the CAP warnings so a slow outlook never delays them.
 */
export const fetchGreenAlerts = cache(async (): Promise<GreenAlerts> => {
  try {
    const [alerts, outlook] = await Promise.all([
      fetchActiveAlerts(),
      fetchSectorOutlook(),
    ]);
    return greenAlerts(outlook, alerts, new Date());
  } catch (error) {
    reportError(error, "green-alerts");
    return { status: "unavailable" };
  }
});

/** The masthead's counts from the same read. Never rejects. */
export const fetchGreenStatus = cache(async (): Promise<GreenStatus> => {
  try {
    return greenStatus(await fetchGreenAlerts());
  } catch (error) {
    reportError(error, "green-status");
    return { status: "unavailable" };
  }
});
