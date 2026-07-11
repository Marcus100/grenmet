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
