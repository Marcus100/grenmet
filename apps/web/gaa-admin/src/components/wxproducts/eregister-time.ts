const HOUR_MS = 3_600_000;

/**
 * The observation time is the Day (YY) and Hour (GG) keyed in Identification,
 * in the current UTC month. A day that would fall more than an hour in the
 * future belongs to the previous month. Blank or invalid entries fall back to
 * the current UTC hour.
 */
export function observationTime(
  day: string | undefined,
  hour: string | undefined,
  now: Date = new Date()
): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const d = Number(day);
  const h = Number(hour);
  if (!(day && hour && Number.isInteger(d) && Number.isInteger(h))) {
    return new Date(Date.UTC(year, month, now.getUTCDate(), now.getUTCHours()));
  }
  const time = new Date(Date.UTC(year, month, d, h));
  if (time.getTime() > now.getTime() + HOUR_MS) {
    return new Date(Date.UTC(year, month - 1, d, h));
  }
  return time;
}
