import {
  type CapSeverity,
  type CapStatus,
  type PublicWarning,
  type PublicWarningGroup,
  publicWarningsSchema,
} from "@barrelsgd/api-client";
import { captureException } from "@sentry/nextjs";
import { cache } from "react";
import { env } from "@/lib/env";
import type { WarningLevel } from "@/lib/warning-level";

export type { CapSeverity, CapStatus } from "@barrelsgd/api-client";
export type PublicAlert = PublicWarning;
export type HazardGroup = PublicWarningGroup;

const SEVERITY_ORDER: Record<CapSeverity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

const WARNING_FETCH_TIMEOUT_MS = 5000;

/**
 * The public message is deliberately unchanged, but the failure is reported:
 * a warning feed that goes down must raise an alert, not merely inform whoever
 * happens to be looking at the site.
 */
function reportUnavailable(error: unknown): AlertsResult {
  captureException(error, { tags: { feature: "cap-public-warnings" } });
  return { status: "unavailable" };
}

export type AlertsResult =
  | { status: "ok"; groups: HazardGroup[]; activeCount: number }
  | { status: "unavailable" };

/**
 * The non-`Actual` statuses present in a result. Drives the exercise banner:
 * during a drill every warning surface must say so, or a test message can be
 * mistaken for a live one.
 */
export function exerciseStatuses(result: AlertsResult): CapStatus[] {
  if (result.status !== "ok") {
    return [];
  }
  const found = new Set<CapStatus>();
  for (const group of result.groups) {
    for (const alert of group.alerts) {
      if (alert.status !== "Actual") {
        found.add(alert.status);
      }
    }
  }
  return [...found];
}

/** Shared status line for both the mobile accordion and the desktop panel. */
export function alertsSummary(result: AlertsResult): string {
  if (result.status === "unavailable") {
    return "Unavailable";
  }
  if (result.activeCount === 0) {
    return "No active warnings";
  }
  return `${result.activeCount} active`;
}

/**
 * The impact-based level for the whole feed: the most severe alert in effect
 * wins, so a red warning is never softened by the yellow ones beside it.
 */
export function alertsLevel(result: AlertsResult): WarningLevel {
  if (result.status === "unavailable") {
    return "unknown";
  }

  const severities = result.groups.flatMap((group) =>
    group.alerts.map((alert) => alert.severity)
  );
  if (severities.length === 0) {
    return "none";
  }

  const worst = severities.reduce((a, b) =>
    SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b
  );

  if (worst === "Extreme" || worst === "Severe") {
    return "take-action";
  }
  if (worst === "Moderate") {
    return "be-prepared";
  }
  return "be-aware";
}

/**
 * Reads the currently active public warnings.
 *
 * Returns `unavailable` rather than an empty list when the service cannot be
 * reached: on a public warning site an outage must not be presented as an
 * all-clear.
 *
 * Wrapped in React `cache` so the root layout (masthead) and the weather
 * layout (alerts panel) share one request per render instead of two.
 */
export const fetchActiveAlerts = cache(async (): Promise<AlertsResult> => {
  try {
    // Deliberately uncached. The panel must reflect the service's real state on
    // every request: a cached success would keep rendering while the service is
    // down, which is the one failure this panel exists to avoid. The upstream
    // selection endpoint evaluates validity using the server clock. This opts the route out of
    // static prerendering, which would otherwise bake the panel at build time.
    const response = await fetch(`${env.CAP_API_URL}/api/cap/warnings`, {
      cache: "no-store",
      // A hung service is worse than a refused connection: without a deadline
      // the render waits on it indefinitely and the page never resolves.
      signal: AbortSignal.timeout(WARNING_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return reportUnavailable(
        new Error(`CAP warnings responded ${response.status}`)
      );
    }
    const body = publicWarningsSchema.parse(await response.json());
    return { activeCount: body.activeCount, groups: body.groups, status: "ok" };
  } catch (error) {
    return reportUnavailable(error);
  }
});
