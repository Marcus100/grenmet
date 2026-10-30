import "server-only";

import { cache } from "react";
import { fetchActiveAlerts } from "@/lib/cap";
import type { AlertsResult } from "@/lib/cap-alerts";
import { greenAlerts } from "@/lib/green-alerts";
import { fetchSectorOutlook } from "@/lib/products";

/**
 * The warning status every masthead surface shows: the CAP warnings, plus how
 * many Green alerts are in effect, from the same sources as /alerts. Green
 * alerts that cannot be read are `unavailable`, never counted as none.
 */
export const fetchMastheadAlerts = cache(async (): Promise<AlertsResult> => {
  const [alerts, outlook] = await Promise.all([
    fetchActiveAlerts(),
    fetchSectorOutlook(),
  ]);
  if (alerts.status === "unavailable") {
    return alerts;
  }
  const green = greenAlerts(outlook, alerts, new Date());
  return {
    ...alerts,
    green:
      green.status === "ok"
        ? { status: "ok", count: green.items.length }
        : { status: "unavailable" },
  };
});
