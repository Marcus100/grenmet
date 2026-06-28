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

/** Long form, e.g. "Friday, 13 June 2026". */
export function formatLongDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
