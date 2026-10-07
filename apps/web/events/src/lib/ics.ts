import type { PublicEvent } from "@/domain/types";

const SEPARATORS = /[-:]/g;
const MILLISECONDS = /\.\d{3}/;
const BACKSLASH = /\\/g;
const NEWLINE = /\n/g;
const COMMA = /,/g;
const SEMICOLON = /;/g;

/** "20261003T200000Z" — iCalendar UTC form. */
function toIcsUtc(instant: string): string {
  return new Date(instant)
    .toISOString()
    .replace(SEPARATORS, "")
    .replace(MILLISECONDS, "");
}

/** Escapes text per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(BACKSLASH, "\\\\")
    .replace(NEWLINE, "\\n")
    .replace(COMMA, "\\,")
    .replace(SEMICOLON, "\\;");
}

/** A single-event iCalendar file so attendees can add it to any calendar. */
export function buildIcs(event: PublicEvent, url: string, stamp: Date): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barrels Grenada//Barrels Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@events.barrels.gd`,
    `DTSTAMP:${toIcsUtc(stamp.toISOString())}`,
    `DTSTART:${toIcsUtc(event.startsAt)}`,
    `DTEND:${toIcsUtc(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(`${event.summary}\n${url}`)}`,
    `LOCATION:${escapeText(event.venue)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
