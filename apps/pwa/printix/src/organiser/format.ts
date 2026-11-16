// Dates and times for the organiser screens. Event times are shown in Grenada
// time, where the events are, not in the phone's own time zone.

export const EVENT_TIME_ZONE = "America/Grenada";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: EVENT_TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: EVENT_TIME_ZONE,
});

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: EVENT_TIME_ZONE,
});

/** An event's calendar date ("2026-12-26"). Noon UTC keeps it on its own day in every zone. */
export function formatEventDate(eventDate: string): string {
  return dateFormat.format(new Date(`${eventDate}T12:00:00Z`));
}

/** A moment, shown in Grenada time. */
export function formatMoment(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** The time of the last refresh. */
export function formatClock(at: Date): string {
  return clockFormat.format(at);
}

/** Grenada keeps UTC-4 all year (no daylight saving), so a local time has a fixed offset. */
const GRENADA_OFFSET = "-04:00";

/**
 * A time typed in Grenada time ("2026-12-27T00:00", from a datetime-local input)
 * as an offset-aware ISO string, which the API requires.
 */
export function grenadaLocalToIso(local: string): string {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return `${withSeconds}${GRENADA_OFFSET}`;
}

/** The calendar date ("YYYY-MM-DD") of a Grenada-time local string. */
export function localDatePart(local: string): string {
  return local.slice(0, 10);
}

/** A calendar date ("YYYY-MM-DD") `days` after another, in UTC, as the server counts it. */
export function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** Today's date in UTC, as the server compares dates. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
