import type {
  CapAlertPublic,
  CapCertainty,
  CapInfoPublic,
} from "@barrelsgd/api-client";

const GRENADA_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "America/Grenada",
  weekday: "short",
});

/** "Thu 24 Sept, 6:00 pm AST" — warnings always state local time and zone. */
export function formatWarningTime(
  iso: string | null | undefined
): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${GRENADA_TIME.format(date)} AST`;
}

/** CAP certainty in the plain words of the GMS likelihood scale. */
export const CERTAINTY_LABEL: Record<CapCertainty, string> = {
  Observed: "Happening now",
  Likely: "Likely",
  Possible: "Possible",
  Unlikely: "Unlikely",
  Unknown: "Not stated",
};

/** Path of a warning's own page. CAP identifiers may contain `:` and `.`. */
export function warningHref(identifier: string): string {
  return `/warnings/${encodeURIComponent(identifier)}`;
}

/** The info block the public reads: English first, then authored order. */
export function primaryInfo(alert: CapAlertPublic): CapInfoPublic | null {
  const infos = [...(alert.info ?? [])].sort(
    (a, b) =>
      Number(!(a.language ?? "en").toLowerCase().startsWith("en")) -
        Number(!(b.language ?? "en").toLowerCase().startsWith("en")) ||
      a.sequence - b.sequence
  );
  return infos[0] ?? null;
}

/**
 * A warning in the shape of the GMS content contract
 * (docs/operations/warning-ibf-framework.md §6): what is expected, what to do,
 * where, when, and how likely.
 */
export interface WarningDetail {
  areas: string[];
  cancellationReason: string | null;
  certainty: string;
  ended: "cancelled" | "expired" | null;
  event: string;
  expires: string | null;
  headline: string;
  identifier: string;
  instruction: string | null;
  issued: string | null;
  sender: string;
  severity: NonNullable<CapInfoPublic["severity"]>;
  starts: string | null;
  status: CapAlertPublic["status"];
  whatToExpect: string;
}

function naturalEndAt(alert: CapAlertPublic, now: Date): string | null {
  if (alert.lifecycle_state !== "PUBLISHED" || alert.replaced_by_identifier) {
    return null;
  }
  const expires = alert.info?.map((info) => info.expires);
  if (!expires?.length || expires.some((value) => !value)) {
    return null;
  }
  const times = expires.map((value) => new Date(value ?? "").getTime());
  if (times.some((time) => Number.isNaN(time) || time > now.getTime())) {
    return null;
  }
  return new Date(Math.max(...times)).toISOString();
}

function endedHow(alert: CapAlertPublic, now: Date): WarningDetail["ended"] {
  if (alert.replaced_by_identifier) {
    return null;
  }
  if (alert.lifecycle_state === "CANCELLED") {
    return "cancelled";
  }
  if (alert.lifecycle_state === "EXPIRED") {
    return "expired";
  }
  return naturalEndAt(alert, now) ? "expired" : null;
}

export function toWarningDetail(
  alert: CapAlertPublic,
  now = new Date()
): WarningDetail | null {
  const info = primaryInfo(alert);
  if (!info) {
    return null;
  }
  const ended = endedHow(alert, now);
  return {
    areas: (info.areas ?? []).map((area) => area.area_desc),
    cancellationReason:
      ended === "cancelled" ? (alert.cancellation_reason ?? null) : null,
    certainty: CERTAINTY_LABEL[info.certainty ?? "Unknown"],
    ended,
    event: info.event,
    expires: formatWarningTime(info.expires),
    headline: info.headline,
    identifier: alert.identifier,
    instruction: info.instruction?.trim() || null,
    issued: formatWarningTime(alert.sent),
    sender: info.sender_name || "Grenada Meteorological Service",
    severity: info.severity ?? "Unknown",
    starts: formatWarningTime(info.onset ?? info.effective),
    status: alert.status,
    whatToExpect: info.description,
  };
}

export interface EndedWarning {
  endedAt: string;
  event: string;
  headline: string;
  how: "cancelled" | "expired";
  identifier: string;
}

export const RECENTLY_ENDED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Warnings that ended in the last 24 hours, newest first. GMS issues the
 * all-clear explicitly (framework §3), so an ended warning stays visible in
 * grey for a day rather than silently disappearing.
 */
export function recentlyEnded(
  alerts: CapAlertPublic[],
  now: Date
): EndedWarning[] {
  const cutoff = now.getTime() - RECENTLY_ENDED_WINDOW_MS;
  return alerts
    .flatMap((alert) => {
      if (alert.replaced_by_identifier) {
        return [];
      }
      const info = primaryInfo(alert);
      const endedAt =
        alert.expired_at ??
        naturalEndAt(alert, now) ??
        (alert.lifecycle_state === "CANCELLED" ||
        alert.lifecycle_state === "EXPIRED"
          ? alert.updated_at
          : null);
      if (!endedAt) {
        return [];
      }
      const time = new Date(endedAt).getTime();
      if (
        !info ||
        alert.status !== "Actual" ||
        Number.isNaN(time) ||
        time < cutoff ||
        time > now.getTime()
      ) {
        return [];
      }
      return [
        {
          endedAt: formatWarningTime(endedAt) ?? endedAt,
          event: info.event,
          headline: info.headline,
          how:
            alert.lifecycle_state === "CANCELLED"
              ? ("cancelled" as const)
              : ("expired" as const),
          identifier: alert.identifier,
          sortKey: time,
        },
      ];
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...ended }) => ended);
}
