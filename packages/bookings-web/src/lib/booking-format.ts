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

/**
 * Short prefixes for the currencies these bookings use, so a bare "$" never
 * reads as the wrong dollar. Other codes print as the code.
 */
// Amounts are divided by 100, so only currencies with two decimal places are
// supported (XCD, USD, NZD, TTD and the like); a zero- or three-decimal
// currency such as JPY or KWD would need its own minor-unit rule first.
const CURRENCY_PREFIX: Readonly<Record<string, string>> = {
  NZD: "NZ$",
  USD: "US$",
  XCD: "EC$",
};

const WHOLE_AMOUNT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const CENTS_AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A price or deposit from minor units and an ISO 4217 code:
 * "EC$210" (XCD), "EC$210.50" with cents, "US$210" (USD), "NZ$210" (NZD),
 * "GBP 210" for any other code. Whole amounts have no ".00"; thousands get
 * separators ("EC$1,250"); a negative amount reads "-EC$210". The currency is required so no caller can fall
 * back to a hidden default.
 */
export function formatMoney(minor: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  // The sign goes before the currency: "-EC$210", never "EC$-210".
  const sign = minor < 0 ? "-" : "";
  const size = Math.abs(minor);
  const amount = (size % 100 === 0 ? WHOLE_AMOUNT : CENTS_AMOUNT).format(
    size / 100
  );
  const prefix = CURRENCY_PREFIX[code];
  return prefix ? `${sign}${prefix}${amount}` : `${sign}${code} ${amount}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
