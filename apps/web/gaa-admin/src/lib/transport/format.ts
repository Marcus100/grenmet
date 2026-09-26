// Display helpers for the FastAPI staff transport timetable
// (`/api/v1/transport/*`). Parsing and seeding live in FastAPI
// (`scripts/seed_catalogues.py`).

/**
 * Service time "HH:MM[:SS]" to a 12-hour label, e.g. "22:30" → "10:30 PM".
 * Times past 24:00 (a night trip, GTFS convention) are marked "(next day)".
 */
export function formatTime(value: string): string {
  const [rawHour, minute] = value.split(":");
  const serviceHour = Number.parseInt(rawHour, 10);
  let hour = serviceHour % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) {
    hour = 12;
  }
  const nextDay = serviceHour >= 24 ? " (next day)" : "";
  return `${hour}:${minute} ${suffix}${nextDay}`;
}

/** Human label for a trip direction. */
export function formatDirection(direction: string): string {
  return direction === "inbound" ? "To MBIA" : "From MBIA";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "2026-10-05" → "5 Oct 2026". Calendar dates are never timezone-shifted, and a
 * fixed month table avoids ICU differences ("Sep" vs "Sept") between runtimes.
 */
export function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
