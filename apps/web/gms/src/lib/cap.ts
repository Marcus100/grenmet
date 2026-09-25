import {
  type CapAlertPublic,
  type CapSeverity,
  type CapStatus,
  capAlertListPublicSchema,
  capAlertPublicSchema,
  type PublicWarning,
  type PublicWarningGroup,
  publicWarningsSchema,
} from "@barrelsgd/api-client";
import { captureException } from "@sentry/nextjs";
import { cache } from "react";
import { env } from "@/lib/env";
import { WARNING_LEVEL_LABEL, type WarningLevel } from "@/lib/warning-level";

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
  captureException(error, { tags: { area: "cap-public-warnings" } });
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

/**
 * The one status line every alert surface shows — header pill, mobile menu,
 * mobile accordion, desktop panel and the Warnings menu card: "No active
 * warnings", or the response level of the most severe alert with the count,
 * e.g. "Be prepared · 2 active". Naming the level keeps colour from being the
 * only signal (Warning Pattern Checklist, docs/design-system.md).
 */
export function alertsSummary(result: AlertsResult): string {
  if (result.status === "unavailable") {
    return "Warnings unavailable";
  }
  if (result.activeCount === 0) {
    return "No active warnings";
  }
  const level = alertsLevel(result);
  const count = `${result.activeCount} active`;
  // A count with no alert detail has no level to name; never pair it with
  // "No active warnings".
  return level === "none" || level === "unknown"
    ? count
    : `${WARNING_LEVEL_LABEL[level]} · ${count}`;
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
    group.alerts
      .filter((alert) => alert.status === "Actual")
      .map((alert) => alert.severity)
  );
  if (severities.length === 0) {
    return "none";
  }

  const worst = severities.reduce((a, b) =>
    SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b
  );
  return severityLevel(worst);
}

/** The impact-based level one CAP severity maps to. */
export function severityLevel(severity: CapSeverity): WarningLevel {
  if (severity === "Extreme" || severity === "Severe") {
    return "take-action";
  }
  if (severity === "Moderate") {
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

export type PublicAlertResult =
  | { status: "ok"; alert: CapAlertPublic }
  | { status: "not-found" }
  | { status: "unavailable" };

/**
 * One published public warning by CAP identifier, including what to expect,
 * what to do, onset and certainty — the fields the `/warnings` summary omits.
 * Uncached for the same reason as `fetchActiveAlerts`: a warning page must
 * never show a stale state. A 404 is "not found", not an outage.
 */
export const fetchPublicAlert = cache(
  async (identifier: string): Promise<PublicAlertResult> => {
    try {
      const response = await fetch(
        `${env.CAP_API_URL}/api/cap/alerts/${encodeURIComponent(identifier)}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(WARNING_FETCH_TIMEOUT_MS),
        }
      );
      if (response.status === 404) {
        return { status: "not-found" };
      }
      if (!response.ok) {
        reportUnavailable(new Error(`CAP alert responded ${response.status}`));
        return { status: "unavailable" };
      }
      return {
        alert: capAlertPublicSchema.parse(await response.json()),
        status: "ok",
      };
    } catch (error) {
      reportUnavailable(error);
      return { status: "unavailable" };
    }
  }
);

/**
 * Expired and cancelled public warnings. Failure yields an empty list: this
 * feeds the "recently ended" all-clear, which is supplementary — the active
 * feed, not this one, decides whether the site says "unavailable".
 */
export const fetchPastAlerts = cache(async (): Promise<CapAlertPublic[]> => {
  try {
    const response = await fetch(`${env.CAP_API_URL}/api/cap/past`, {
      cache: "no-store",
      signal: AbortSignal.timeout(WARNING_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      reportUnavailable(
        new Error(`CAP past alerts responded ${response.status}`)
      );
      return [];
    }
    return capAlertListPublicSchema.parse(await response.json()).data;
  } catch (error) {
    reportUnavailable(error);
    return [];
  }
});
