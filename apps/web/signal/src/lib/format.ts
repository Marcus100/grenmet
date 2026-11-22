/** Human, Morning-Brew-style relative time, e.g. "about 5 hours ago". */
export function formatRelativeTime(
  date: Date | string,
  now: Date = new Date()
): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `about ${diffH} hour${diffH === 1 ? "" : "s"} ago`;

  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} day${diffD === 1 ? "" : "s"} ago`;

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const DAY_MS = 86_400_000;

/**
 * Whole days from a calendar date (`YYYY-MM-DD`, read as UTC midnight) to
 * `now`. Zero for today or a later date; infinite when the date is unreadable,
 * so an unreadable date is never shown as recent.
 */
export function daysSince(date: string, now: Date = new Date()): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** Long form, e.g. "Friday, 13 June 2026". */
export function formatLongDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
