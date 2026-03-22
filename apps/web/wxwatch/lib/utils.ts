/**
 * Get the URL path for serving an image from the public folder.
 * This is a client-safe utility function.
 */
export function getImageUrl(storagePath: string): string {
  return `/wxwatch/${storagePath}`;
}

/**
 * Round a date/time to the nearest synoptic time (00, 03, 06, 09, 12, 15, 18, 21z).
 * Returns a new Date object with the rounded time.
 */
export function roundToSynopticTime(date: Date): Date {
  const rounded = new Date(date);
  const hour = rounded.getUTCHours();
  // Round down to nearest 3-hour interval
  const synopticHour = Math.floor(hour / 3) * 3;
  rounded.setUTCHours(synopticHour, 0, 0, 0);
  return rounded;
}

/**
 * Get the synoptic hour (00, 03, 06, 09, 12, 15, 18, 21) as a 2-digit string.
 */
export function getSynopticHour(date: Date): string {
  const hour = date.getUTCHours();
  const synopticHour = Math.floor(hour / 3) * 3;
  return synopticHour.toString().padStart(2, "0");
}

/**
 * Format a date as YYYY/MM/DD for URL routing.
 */
export function formatDateForUrl(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `/${year}/${month}/${day}`;
}

/**
 * Parse year, month, day strings from URL params to a Date object (UTC).
 * Returns null if invalid.
 */
export function parseDateFromUrl(
  year: string,
  month: string,
  day: string
): Date | null {
  const yearNum = Number.parseInt(year, 10);
  const monthNum = Number.parseInt(month, 10);
  const dayNum = Number.parseInt(day, 10);

  if (
    Number.isNaN(yearNum) ||
    Number.isNaN(monthNum) ||
    Number.isNaN(dayNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  // Validate the date is valid (catches invalid dates like Feb 30)
  if (
    date.getUTCFullYear() !== yearNum ||
    date.getUTCMonth() !== monthNum - 1 ||
    date.getUTCDate() !== dayNum
  ) {
    return null;
  }

  return date;
}

/**
 * Get today's date in UTC.
 */
export function getTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * Add or subtract days from a date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
