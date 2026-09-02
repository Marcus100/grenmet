const GRENADA_TIME_ZONE = "America/Grenada";

const dayPartsFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: GRENADA_TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: GRENADA_TIME_ZONE,
});

/**
 * Renders an event start as "Saturday, 15 August · 4:00 PM" in Grenada local
 * time. Built from parts rather than a locale pattern so the output does not
 * shift with the runtime's locale data.
 */
export function formatEventDate(startsAt: string): string {
  const date = new Date(startsAt);
  const parts = dayPartsFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("weekday")}, ${part("day")} ${part("month")} · ${timeFormat.format(date)}`;
}
