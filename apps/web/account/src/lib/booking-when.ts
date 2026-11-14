const DAY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};
const CLOCK: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/**
 * "Saturday, 14 November 2026, 10:00 am to 11:00 am". With `"UTC"` the same
 * text is in UTC and the clock times carry a "UTC" label; this is the text
 * shown before the browser has loaded, so the zone is never hidden. Without it,
 * the viewer's own zone is used and nothing is labelled, because the API sends
 * no timezone for a booking. A booking that ends on another day repeats the
 * day for its end time.
 */
export function formatBookingWhen(
  startsAt: string,
  endsAt: string,
  zone?: "UTC"
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const zoneOption: Intl.DateTimeFormatOptions = zone ? { timeZone: zone } : {};
  const suffix = zone ? ` ${zone}` : "";
  const day = (instant: Date) =>
    new Intl.DateTimeFormat("en-GB", { ...DAY, ...zoneOption }).format(instant);
  const clock = (instant: Date) =>
    `${new Intl.DateTimeFormat("en-GB", { ...CLOCK, ...zoneOption }).format(instant)}${suffix}`;

  if (day(start) === day(end)) {
    return `${day(start)}, ${clock(start)} to ${clock(end)}`;
  }
  return `${day(start)}, ${clock(start)} to ${day(end)}, ${clock(end)}`;
}
