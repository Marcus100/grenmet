import type {
  CapSeverity,
  CapStatus,
  PublicWarning,
  PublicWarningGroup,
} from "@barrelsgd/api-client";
import { WARNING_LEVEL_LABEL, type WarningLevel } from "@/lib/warning-level";

// Pure helpers for the public warning feed, safe in Server and Client
// Components. Fetching lives in cap.ts, which is server-only.
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

/**
 * Green alerts in effect, as the masthead needs them: how many, or that they
 * could not be read. Green is not a CAP warning, so it never changes the level.
 */
export type GreenStatus =
  | { status: "ok"; count: number }
  | { status: "unavailable" };

export type AlertsResult =
  | {
      status: "ok";
      groups: HazardGroup[];
      activeCount: number;
      /** Set by the masthead feed; absent where only CAP warnings are read. */
      green?: GreenStatus;
    }
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
 * What to say when no CAP warning is in effect. "No active alerts" is said
 * only when Green alerts are known to be none too; Green alerts in effect are
 * named, and unreadable Green alerts are never an all-clear.
 */
function noWarningsSummary(green: GreenStatus | undefined): string {
  if (green?.status === "unavailable") {
    return "Green alerts unavailable";
  }
  if (green && green.count > 0) {
    return green.count === 1
      ? "Green alert in effect"
      : `${green.count} Green alerts in effect`;
  }
  return "No active alerts";
}

/**
 * The one status line every alert surface shows — header pill, mobile menu,
 * mobile accordion, desktop panel and the Alerts menu card: "No active
 * alerts", or the response level of the most severe alert with the count,
 * e.g. "Be prepared · 2 active". Naming the level keeps colour from being the
 * only signal (Warning Pattern Checklist, docs/design-system.md).
 */
export function alertsSummary(result: AlertsResult): string {
  if (result.status === "unavailable") {
    return "Alerts unavailable";
  }
  if (result.activeCount === 0) {
    return noWarningsSummary(result.green);
  }
  const level = alertsLevel(result);
  const count = `${result.activeCount} active`;
  // A count with no alert detail has no level to name; never pair it with
  // "No active alerts".
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

/**
 * The level a surface should colour by. The CAP level, except that with no
 * warning in effect and Green alerts unreadable it is `unknown` (grey), so an
 * unreadable feed never looks like the calm all-clear colour.
 */
export function alertsDisplayLevel(result: AlertsResult): WarningLevel {
  const level = alertsLevel(result);
  if (
    level === "none" &&
    result.status === "ok" &&
    result.green?.status === "unavailable"
  ) {
    return "unknown";
  }
  return level;
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
