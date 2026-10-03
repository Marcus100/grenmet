// Week arithmetic for the janitorial shift board. Dates are ISO strings
// (YYYY-MM-DD) handled in UTC so no local timezone shifts a day.

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * DAY_MS));
}

/** Today's date at the airports (Grenada, UTC−4 all year). */
export function grenadaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
  }).format(now);
}

/** Monday of the week containing `date` (or today when missing or invalid). */
export function weekStart(date: string | undefined, today: string): string {
  const base =
    date && ISO_DATE.test(date) && !Number.isNaN(parse(date).getTime())
      ? date
      : today;
  const weekday = (parse(base).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(base, -weekday);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** e.g. "Mon 5 Oct". */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(parse(date));
}
