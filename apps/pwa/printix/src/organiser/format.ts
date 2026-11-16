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
