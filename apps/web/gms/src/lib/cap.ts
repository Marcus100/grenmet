import "server-only";
import {
  type CapAlertPublicView,
  capAlertListPublicViewSchema,
  capAlertPublicViewSchema,
  publicWarningsSchema,
} from "@barrelsgd/api-client";
import { captureException } from "@sentry/nextjs";
import { cache } from "react";
import type { AlertsResult } from "@/lib/cap-alerts";
import { env } from "@/lib/env";

// The pure helpers moved to cap-alerts.ts so Client Components can use them
// without bundling this server-only fetching module.
export type {
  AlertsResult,
  CapSeverity,
  CapStatus,
  HazardGroup,
  PublicAlert,
} from "@/lib/cap-alerts";
export {
  alertsLevel,
  alertsSummary,
  exerciseStatuses,
  severityLevel,
} from "@/lib/cap-alerts";

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
  | { status: "ok"; alert: CapAlertPublicView }
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
        alert: capAlertPublicViewSchema.parse(await response.json()),
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
export const fetchPastAlerts = cache(
  async (): Promise<CapAlertPublicView[]> => {
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
      return capAlertListPublicViewSchema.parse(await response.json()).data;
    } catch (error) {
      reportUnavailable(error);
      return [];
    }
  }
);
