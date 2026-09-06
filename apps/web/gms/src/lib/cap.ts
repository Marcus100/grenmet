import { captureException } from "@sentry/nextjs";
import { cache } from "react";
import { env } from "@/lib/env";

/** CAP severity, ordered most to least severe. Drives colour and sort order. */
export type CapSeverity =
  | "Extreme"
  | "Severe"
  | "Moderate"
  | "Minor"
  | "Unknown";

export interface PublicAlert {
  areas: string[];
  /** The forecaster's free-text event name, e.g. "Small Craft Advisory". */
  event: string;
  expires: string | null;
  headline: string;
  identifier: string;
  severity: CapSeverity;
}

/**
 * Hazard groups shown on the public site. `match` is tested against the CAP
 * event name, which is free text: forecasters type it rather than picking from
 * a catalogue, so no pattern set can be exhaustive. Anything unmatched falls to
 * OTHER_HAZARD rather than disappearing — a published warning must never be
 * invisible because of how it was phrased.
 */
export const HAZARD_GROUPS = [
  {
    name: "Tropical Cyclone",
    match: /cyclone|hurricane|tropical storm|depression/i,
  },
  {
    name: "Marine / Small Craft",
    match: /marine|small craft|sea|swell|surf|wave/i,
  },
  { name: "Flood / Heavy Rain", match: /flood|rain|flash/i },
  { name: "Thunderstorm", match: /thunder|lightning|storm(?! surge)/i },
  { name: "Wind", match: /wind|gale|gust/i },
  { name: "Heat", match: /heat|high temperature/i },
  { name: "Dust / Haze", match: /dust|haze|saharan|smoke/i },
  {
    name: "Coastal Hazard",
    match: /coastal|storm surge|rip current|inundation/i,
  },
] as const;

export const OTHER_HAZARD = "Other warnings";

export interface HazardGroup {
  alerts: PublicAlert[];
  name: string;
}

const SEVERITY_ORDER: Record<CapSeverity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

/** Groups alerts under the fixed hazard names, most severe first within each. */
export function groupAlerts(alerts: PublicAlert[]): HazardGroup[] {
  const groups: HazardGroup[] = HAZARD_GROUPS.map((g) => ({
    name: g.name,
    alerts: [],
  }));
  const other: HazardGroup = { name: OTHER_HAZARD, alerts: [] };

  for (const alert of alerts) {
    const index = HAZARD_GROUPS.findIndex((g) => g.match.test(alert.event));
    (index === -1 ? other : groups[index]).alerts.push(alert);
  }

  for (const group of groups) {
    group.alerts.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
  }

  // The catch-all is only meaningful when something landed in it.
  return other.alerts.length > 0 ? [...groups, other] : groups;
}

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

interface RawArea {
  area_desc?: string;
}

interface RawInfo {
  areas?: RawArea[];
  event?: string;
  expires?: string | null;
  headline?: string;
  severity?: string;
}

interface RawAlert {
  identifier?: string;
  info?: RawInfo[];
}

const SEVERITIES: CapSeverity[] = [
  "Extreme",
  "Severe",
  "Moderate",
  "Minor",
  "Unknown",
];

function toSeverity(value: string | undefined): CapSeverity {
  return SEVERITIES.find((s) => s === value) ?? "Unknown";
}

/** Flattens the CAP alert/info structure into what the panel renders. */
export function toPublicAlerts(raw: RawAlert[]): PublicAlert[] {
  const alerts: PublicAlert[] = [];
  for (const alert of raw) {
    const info = alert.info?.[0];
    if (!(info?.event && alert.identifier)) {
      continue;
    }
    alerts.push({
      areas: (info.areas ?? [])
        .map((a) => a.area_desc)
        .filter((d): d is string => Boolean(d)),
      event: info.event,
      expires: info.expires ?? null,
      headline: info.headline ?? info.event,
      identifier: alert.identifier,
      severity: toSeverity(info.severity),
    });
  }
  return alerts;
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
    // endpoint is already Redis-cached for 30s, so the database is protected
    // even though every request reaches FastAPI. This also opts the route out of
    // static prerendering, which would otherwise bake the panel at build time.
    const response = await fetch(`${env.CAP_API_URL}/api/cap/latest-active`, {
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
    const body = (await response.json()) as { data?: RawAlert[] };
    const alerts = toPublicAlerts(body.data ?? []);
    return {
      activeCount: alerts.length,
      groups: groupAlerts(alerts),
      status: "ok",
    };
  } catch (error) {
    return reportUnavailable(error);
  }
});
