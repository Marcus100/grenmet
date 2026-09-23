// Display helpers for the signed-in profile view on the auth home page.

const RE_WHITESPACE = /\s+/;

export function getInitials(fullName: string | null, email: string): string {
  const nameParts = (fullName ?? "")
    .trim()
    .split(RE_WHITESPACE)
    .filter(Boolean);

  if (nameParts.length > 0) {
    const first = nameParts[0]?.[0] ?? "";
    const last = nameParts.length > 1 ? (nameParts.at(-1)?.[0] ?? "") : "";
    const initials = `${first}${last}`.toUpperCase();
    if (initials) return initials;
  }

  return email[0]?.toUpperCase() ?? "?";
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(new Date(value));
}

const RELATIVE_UNITS: ReadonlyArray<
  readonly [Intl.RelativeTimeFormatUnit, number]
> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago", "yesterday"; anything under a minute is "just now". */
export function formatRelative(
  value: string,
  now: number = Date.now()
): string {
  const elapsed = new Date(value).getTime() - now;
  const format = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= size) {
      return format.format(Math.round(elapsed / size), unit);
    }
  }
  return "just now";
}

export function describePasswordAge(
  changedAt: string | null | undefined,
  now: number = Date.now()
): string {
  if (!changedAt) return "No change recorded yet.";
  return `Last changed ${formatRelative(changedAt, now)} (${formatDate(changedAt)}).`;
}
