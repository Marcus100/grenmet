import type { AlertsResult } from "@/lib/cap";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { alertCoversLocation, type SiteLocation } from "@/lib/locations";

/**
 * The weather shown for a place. The default place gets the national snapshot
 * unchanged. Other places have no local forecast or observation feed yet, so
 * they get the national forecast, no observation (never another station's
 * reading), and a label that says so.
 */
export function weatherForLocation(
  national: WeatherSnapshot,
  location: SiteLocation
): WeatherSnapshot {
  if (location.isDefault) {
    return national;
  }
  return {
    ...national,
    observation: null,
    label: `National forecast for Grenada, Carriacou and Petite Martinique. ${national.label}`,
  };
}

/**
 * Alerts for a place: every alert for the default place (unchanged), otherwise
 * national alerts plus those naming this place. An outage stays an outage.
 */
export function alertsForLocation(
  alerts: AlertsResult,
  location: SiteLocation
): AlertsResult {
  if (location.isDefault || alerts.status !== "ok") {
    return alerts;
  }
  const groups = alerts.groups.map((group) => ({
    ...group,
    alerts: group.alerts.filter((alert) =>
      alertCoversLocation(alert.areas, location)
    ),
  }));
  return {
    status: "ok",
    groups,
    activeCount: groups.reduce((sum, group) => sum + group.alerts.length, 0),
  };
}
