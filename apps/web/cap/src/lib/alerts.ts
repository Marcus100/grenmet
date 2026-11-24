import type { CapAlertPublicView } from "@barrelsgd/api-client";
import {
  severityLevel,
  WARNING_LEVEL_LABEL,
  type WarningLevel,
} from "@barrelsgd/gms/warning-levels";

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

// The level mapping is shared with the GMS site so the public sees exactly
// the colour the forecaster issued: Minor Green, Moderate Yellow "Be aware",
// Severe Orange "Be prepared", Extreme Red "Take action now".
export {
  severityLevel,
  WARNING_LEVEL_COLOUR_NAME,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_MAP_FILL,
  WARNING_LEVEL_SURFACE,
  type WarningLevel,
} from "@barrelsgd/gms/warning-levels";

/** What one alert looks like on a card, flattened from CAP's nested shape. */
export interface AlertView {
  areas: string[];
  certainty: string;
  description: string;
  effective: string | null;
  /** When it ended, if the record says (cancel or expiry time); else null. */
  endedAt: string | null;
  event: string;
  expires: string | null;
  headline: string;
  identifier: string;
  instruction: string | null;
  level: WarningLevel;
  lifecycle: string;
  msgType: string;
  onset: string | null;
  sent: string;
  severity: Severity;
  status: string;
  urgency: Urgency;
}

/** When a cancelled or expired alert ended; null while the record gives none. */
function endedAtOf(
  alert: CapAlertPublicView,
  expires: string | null
): string | null {
  if (alert.lifecycle_state === "CANCELLED" || alert.msg_type === "Cancel") {
    return alert.expired_at ?? alert.updated_at ?? null;
  }
  if (alert.lifecycle_state === "EXPIRED") {
    return alert.expired_at ?? expires;
  }
  return null;
}

/**
 * Flattens a CAP alert to what a card shows. The English block wins when the
 * alert carries several languages; otherwise the first block is used. Returns
 * null for an alert with no info block, which has nothing to display.
 */
export function toAlertView(alert: CapAlertPublicView): AlertView | null {
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
    endedAt: endedAtOf(alert, info.expires ?? null),
    level: severityLevel(info.severity ?? "Unknown"),
    lifecycle: alert.lifecycle_state,
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
  if (view.lifecycle === "EXPIRED" || view.lifecycle === "CANCELLED") {
    return false;
  }
  if (view.expires && Date.parse(view.expires) <= now.getTime()) {
    return false;
  }
  return true;
}

/** The time to show beside "Ended": the recorded end, else the expiry. */
export function endedTime(view: AlertView): string | null {
  return view.endedAt ?? view.expires;
}

export interface ActiveSplit {
  /** Real warnings (status Actual), most severe first. */
  actual: AlertView[];
  /** Exercise, system and test messages: never presented as live warnings. */
  exercise: AlertView[];
}

export function splitActive(
  alerts: CapAlertPublicView[],
  now: Date
): ActiveSplit {
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

/** "18 Oct 2026, 10:05" in Grenada time: the date and time a feed was read. */
export function formatUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: GRENADA_TIME_ZONE,
    year: "numeric",
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
