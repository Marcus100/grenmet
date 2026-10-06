const GRENADA_TIME_ZONE = "America/Grenada";

const dayPartsFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: GRENADA_TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: GRENADA_TIME_ZONE,
});

/**
 * Renders an event start as "Saturday, 15 August · 4:00 PM" in Grenada local
 * time. Built from parts rather than a locale pattern so the output does not
 * shift with the runtime's locale data.
 */
export function formatEventDate(startsAt: string): string {
  const date = new Date(startsAt);
  const parts = dayPartsFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("weekday")}, ${part("day")} ${part("month")} · ${timeFormat.format(date)}`;
}

/** Grenada does not observe daylight saving; local time is always UTC−4. */
const GRENADA_OFFSET = "-04:00";

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: GRENADA_TIME_ZONE,
});

const weekdayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: GRENADA_TIME_ZONE,
});

const shortMonthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: GRENADA_TIME_ZONE,
});

const dayNumberFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: GRENADA_TIME_ZONE,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The Grenada calendar date of an instant, as "YYYY-MM-DD". */
export function grenadaDateKey(instant: Date | string): string {
  return dateKeyFormat.format(new Date(instant));
}

/** Day of week in Grenada, 0 = Sunday. */
export function grenadaWeekday(instant: Date | string): number {
  return WEEKDAY_INDEX[weekdayFormat.format(new Date(instant))] ?? 0;
}

/** Adds whole days to a "YYYY-MM-DD" key. */
export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days)
  );
  return shifted.toISOString().slice(0, 10);
}

/**
 * An ISO instant for a Grenada wall-clock time `days` after the Grenada date
 * of `now`. Used to keep demo data current relative to today.
 */
export function grenadaWallClock(
  now: Date,
  days: number,
  time: string
): string {
  return `${addDaysToKey(grenadaDateKey(now), days)}T${time}:00${GRENADA_OFFSET}`;
}

/** "7:00 PM" in Grenada time. */
export function formatTime(instant: string): string {
  return timeFormat.format(new Date(instant));
}

/** "Saturday, 3 October" for a "YYYY-MM-DD" Grenada date key. */
export function formatDayKey(key: string): string {
  const parts = dayPartsFormat.formatToParts(
    new Date(`${key}T12:00:00${GRENADA_OFFSET}`)
  );
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}

/** Compact parts for a date stamp: { weekday: "Sat", day: "3", month: "Oct" }. */
export function dateStamp(instant: string): {
  day: string;
  month: string;
  weekday: string;
} {
  const date = new Date(instant);
  return {
    weekday: weekdayFormat.format(date),
    day: dayNumberFormat.format(date),
    month: shortMonthFormat.format(date),
  };
}
