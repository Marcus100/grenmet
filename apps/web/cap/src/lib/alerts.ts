import type { CapAlertPublic } from "@barrelsgd/api-client";

// Pure mapping helpers for the public alert hub. Safe in Server and Client
// Components; fetching and the last-known-good store live in cap-api.ts.

export type Severity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type Urgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";

const SEVERITY_RANK: Record<Severity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

const URGENCY_RANK: Record<Urgency, number> = {
  Immediate: 0,
  Expected: 1,
  Future: 2,
  Past: 3,
  Unknown: 4,
};

/** Impact-based level the public sees; the same four steps as the GMS site. */
export type WarningLevel =
  | "none"
  | "be-aware"
  | "be-prepared"
  | "take-action"
  | "unknown";

export const WARNING_LEVEL_LABEL: Record<WarningLevel, string> = {
  none: "No active alerts",
  "be-aware": "Be aware",
  "be-prepared": "Be prepared",
  "take-action": "Take action now",
  unknown: "Status unavailable",
};

export const WARNING_LEVEL_SURFACE: Record<WarningLevel, string> = {
  none: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  "be-aware": "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  "be-prepared": "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  "take-action": "bg-gm-warning-red-bg text-gm-warning-red-fg",
  unknown: "bg-gm-warning-grey-bg text-gm-warning-grey-fg",
};

export function severityLevel(severity: Severity): WarningLevel {
  if (severity === "Extreme" || severity === "Severe") {
    return "take-action";
  }
  if (severity === "Moderate") {
    return "be-prepared";
  }
  return "be-aware";
}

/** What one alert looks like on a card, flattened from CAP's nested shape. */
export interface AlertView {
  areas: string[];
  certainty: string;
  description: string;
  effective: string | null;
  event: string;
  expires: string | null;
  headline: string;
  identifier: string;
  instruction: string | null;
  level: WarningLevel;
  msgType: string;
  onset: string | null;
  sent: string;
  severity: Severity;
  status: string;
  urgency: Urgency;
}

/**
 * Flattens a CAP alert to what a card shows. The English block wins when the
 * alert carries several languages; otherwise the first block is used. Returns
 * null for an alert with no info block, which has nothing to display.
 */
export function toAlertView(alert: CapAlertPublic): AlertView | null {
  const infos = alert.info ?? [];
  const info =
    infos.find((candidate) => (candidate.language ?? "en").startsWith("en")) ??
    infos[0];
  if (!info) {
    return null;
  }
  const areas = [
    ...new Set((info.areas ?? []).map((area) => area.area_desc.trim())),
  ].filter(Boolean);
  return {
    areas,
    certainty: info.certainty ?? "Unknown",
    description: info.description,
    effective: info.effective ?? info.onset ?? null,
    event: info.event,
    expires: info.expires ?? null,
    headline: info.headline,
    identifier: alert.identifier,
    instruction: info.instruction ?? null,
    level: severityLevel(info.severity ?? "Unknown"),
    msgType: alert.msg_type,
    onset: info.onset ?? null,
    sent: alert.sent,
    severity: info.severity ?? "Unknown",
    status: alert.status,
    urgency: info.urgency ?? "Unknown",
  };
}

/** Most severe first, then most urgent, then most recently sent. */
export function compareAlerts(a: AlertView, b: AlertView): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
    Date.parse(b.sent) - Date.parse(a.sent)
  );
}

export function sortBySeverity(views: AlertView[]): AlertView[] {
  return [...views].sort(compareAlerts);
}

/** Newest first, for the history list. */
export function sortNewestFirst(views: AlertView[]): AlertView[] {
  return [...views].sort((a, b) => Date.parse(b.sent) - Date.parse(a.sent));
}

/**
 * True when the alert is in force at `now`. Cancel messages are never active
 * warnings, and an alert past its expiry is dropped even if the API still
 * lists it: last-known-good data must not resurrect an ended warning.
 */
export function isInForce(view: AlertView, now: Date): boolean {
  if (view.msgType === "Cancel") {
    return false;
  }
  if (view.expires && Date.parse(view.expires) <= now.getTime()) {
    return false;
  }
  return true;
}

export interface ActiveSplit {
  /** Real warnings (status Actual), most severe first. */
  actual: AlertView[];
  /** Exercise, system and test messages: never presented as live warnings. */
  exercise: AlertView[];
}

export function splitActive(alerts: CapAlertPublic[], now: Date): ActiveSplit {
  const views = alerts
    .map(toAlertView)
    .filter((view): view is AlertView => view !== null)
    .filter((view) => isInForce(view, now));
  return {
    actual: sortBySeverity(views.filter((view) => view.status === "Actual")),
    exercise: sortBySeverity(views.filter((view) => view.status !== "Actual")),
  };
}

/** The level for the whole feed: the worst alert in effect wins. */
export function overallLevel(actual: AlertView[]): WarningLevel {
  const first = sortBySeverity(actual)[0];
  return first ? first.level : "none";
}

/** Status line shared by the masthead and the home banner. */
export function statusLine(actual: AlertView[]): string {
  if (actual.length === 0) {
    return WARNING_LEVEL_LABEL.none;
  }
  return `${WARNING_LEVEL_LABEL[overallLevel(actual)]} · ${actual.length} active`;
}

// ---------------------------------------------------------------- freshness

/**
 * Feed data older than this is called stale. The API caches for 30 s and this
 * app revalidates every 60 s, so five minutes means several refreshes failed.
 */
export const STALE_AFTER_MINUTES = 5;

export interface Freshness {
  ageMinutes: number;
  stale: boolean;
}

export function freshness(
  fetchedAt: Date,
  now: Date,
  staleAfterMinutes = STALE_AFTER_MINUTES
): Freshness {
  const ageMinutes = Math.max(
    0,
    Math.floor((now.getTime() - fetchedAt.getTime()) / 60_000)
  );
  return { ageMinutes, stale: ageMinutes >= staleAfterMinutes };
}

/** Grenada is UTC-4 all year, with no daylight saving. */
export const GRENADA_TIME_ZONE = "America/Grenada";

/** "14:32" in Grenada time. */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: GRENADA_TIME_ZONE,
  }).format(date);
}

/** "Mon 19 Oct, 14:32" in Grenada time; "Not set" when absent. */
export function formatWhen(iso: string | null): string {
  if (!iso) {
    return "Not set";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: GRENADA_TIME_ZONE,
    weekday: "short",
  }).format(date);
  return `${day}, ${formatClock(date)}`;
}

// ------------------------------------------------------------------- paging

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

/** Clamps a requested page (from a query string) into range. */
export function paginate<T>(
  items: T[],
  requested: unknown,
  size = 20
): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const parsed = Number.parseInt(String(requested ?? "1"), 10);
  const page = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), pageCount)
    : 1;
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    pageCount,
    total,
  };
}
