// Grouping and clock text for My bookings. Pure functions: the list component
// picks the zone (the viewer's after hydration, UTC before) and passes it in.

export interface TimedBooking {
  ends_at: string;
  starts_at: string;
}

export interface DayGroup<T> {
  /** "2026-11-24": the local calendar day, for keys and anchors. */
  day: string;
  items: T[];
  /** "Tuesday 24 November 2026", in the same zone as the grouping. */
  label: string;
}

const DAY_PART: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/** The calendar day of an instant in `timeZone`, as "YYYY-MM-DD". */
export function localDay(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    ...DAY_PART,
    timeZone,
  }).formatToParts(new Date(instant));
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** "Tuesday 24 November 2026" for an instant, in `timeZone`. */
export function dayLabel(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone,
    weekday: "long",
    year: "numeric",
  }).format(new Date(instant));
}

/**
 * Bookings in the order given (the API already sorts them), split into runs of
 * one local day. A booking never moves to a different day than its start.
 */
export function groupByLocalDay<T extends TimedBooking>(
  bookings: readonly T[],
  timeZone: string
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const booking of bookings) {
    const day = localDay(booking.starts_at, timeZone);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.items.push(booking);
    } else {
      groups.push({
        day,
        items: [booking],
        label: dayLabel(booking.starts_at, timeZone),
      });
    }
  }
  return groups;
}

const CLOCK: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
};

/**
 * "10:00 am to 11:00 am". With `label` (the text shown before the browser has
 * loaded, in UTC) each clock time carries a "UTC" label, so that text never hides
 * which zone it is in. A booking that ends on another day adds the end day, like
 * the booking time elsewhere.
 */
export function clockRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
  label = false
): string {
  const suffix = label ? " UTC" : "";
  const clock = (instant: string) =>
    `${new Intl.DateTimeFormat("en-GB", { ...CLOCK, timeZone }).format(new Date(instant))}${suffix}`;
  if (localDay(startsAt, timeZone) === localDay(endsAt, timeZone)) {
    return `${clock(startsAt)} to ${clock(endsAt)}`;
  }
  return `${clock(startsAt)} to ${dayLabel(endsAt, timeZone)}, ${clock(endsAt)}`;
}
