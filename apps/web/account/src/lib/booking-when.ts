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
 * "Saturday 14 November 2026, 10:00 am to 11:00 am" in the viewer's own zone.
 * The API sends no timezone for a booking, so none is shown or assumed. A
 * booking that ends on another day repeats the day for its end time.
 */
export function formatBookingWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startDay = new Intl.DateTimeFormat("en-GB", DAY).format(start);
  const startClock = new Intl.DateTimeFormat("en-GB", CLOCK).format(start);
  const endClock = new Intl.DateTimeFormat("en-GB", CLOCK).format(end);
  if (start.toDateString() === end.toDateString()) {
    return `${startDay}, ${startClock} to ${endClock}`;
  }
  const endDay = new Intl.DateTimeFormat("en-GB", DAY).format(end);
  return `${startDay}, ${startClock} to ${endDay}, ${endClock}`;
}
