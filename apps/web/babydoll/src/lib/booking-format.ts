// Pure date, time and money helpers for the booking pages. Slot times arrive
// as UTC instants; the studio's IANA timezone (from the API) is for display.

/** The window the availability endpoint accepts, in days (inclusive). */
export const WINDOW_DAYS = 14;

/** "2027-01-04" for an instant, as seen on a wall calendar in `timeZone`. */
export function localDay(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Adds whole days to a "YYYY-MM-DD" date (calendar arithmetic, no zone). */
export function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + days));
  return moved.toISOString().slice(0, 10);
}

/** First and last day of the window that starts at `firstDay`. */
export function windowFrom(firstDay: string): {
  firstDay: string;
  lastDay: string;
} {
  return { firstDay, lastDay: addDays(firstDay, WINDOW_DAYS - 1) };
}

export interface SlotLike {
  starts_at: string;
}

/** Slots grouped by local day, days in order, times in order. */
export function groupByDay<T extends SlotLike>(
  slots: readonly T[],
  timeZone: string
): { day: string; slots: T[] }[] {
  const days = new Map<string, T[]>();
  for (const slot of [...slots].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at)
  )) {
    const day = localDay(slot.starts_at, timeZone);
    days.set(day, [...(days.get(day) ?? []), slot]);
  }
  return [...days].map(([day, list]) => ({ day, slots: list }));
}

export function formatDay(day: string, long = false): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(instant));
}

export function formatDateTime(
  instant: Date | string,
  timeZone: string
): string {
  return `${formatDay(localDay(instant, timeZone), true)}, ${formatTime(instant, timeZone)}`;
}

/** "$210" for whole dollars, "$12.50" otherwise; the site shows XCD as "$". */
export function formatMoney(minor: number): string {
  const whole = minor % 100 === 0;
  return `$${(minor / 100).toFixed(whole ? 0 : 2)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
