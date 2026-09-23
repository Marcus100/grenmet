// Display helpers for the FastAPI staff transport timetable
// (`/api/v1/transport/spec`). Parsing and seeding live in FastAPI
// (`scripts/seed_catalogues.py`).

/** 24-hour "HH:MM[:SS]" to a 12-hour label, e.g. "22:30:00" → "10:30 PM". */
export function formatTime(value: string): string {
  const [rawHour, minute] = value.split(":");
  let hour = Number.parseInt(rawHour, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) {
    hour = 12;
  }
  return `${hour}:${minute} ${suffix}`;
}

/** Human label for a trip direction. */
export function formatDirection(direction: string): string {
  return direction === "inbound" ? "To MBIA" : "From MBIA";
}

/** Human label for a trip's day-type applicability. */
export function formatDayType(dayType: string): string {
  switch (dayType) {
    case "daily":
      return "Daily";
    case "sun_hol":
      return "Sundays & public holidays";
    default:
      return "Mon–Sat";
  }
}
