// Pure helpers for the settings screens: money in and out of minor units,
// weekday names and the weekly-hours form. No I/O, so actions and forms stay
// thin and the rules are testable on their own.

import type {
  BookingWorkingPeriodIn,
  BookingWorkingPeriodPublic,
} from "@barrelsgd/api-client";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Zones offered as suggestions; the API accepts any IANA name. */
export const TIMEZONE_SUGGESTIONS = [
  "America/Grenada",
  "America/Port_of_Spain",
  "America/Barbados",
  "America/St_Lucia",
  "America/St_Vincent",
  "America/Jamaica",
  "America/New_York",
  "Europe/London",
] as const;

const MONEY = /^\d{1,7}(?:\.\d{1,2})?$/u;

/**
 * "25" or "25.50" to minor units (2500, 2550). Null when the text is not a
 * plain amount (no sign, no thousands separator, at most two decimals).
 */
export function parseMoney(text: string): number | null {
  const value = text.trim();
  if (!MONEY.test(value)) {
    return null;
  }
  const [whole = "0", cents = ""] = value.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}

/** Minor units as the text a person types back: 2500 is "25", 2550 is "25.50". */
export function moneyInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** An amount with the business currency code: "150 XCD", "25.50 XCD". */
export function moneyWithCurrency(minor: number, currency: string): string {
  return `${moneyInput(minor)} ${currency}`;
}

/** "09:00:00" from the API to "09:00" for a time input. */
export function hhmm(value: string): string {
  return value.slice(0, 5);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** How many rows a day shows: its periods plus one blank, never fewer than two. */
export function rowsForDay(periods: number): number {
  return Math.max(2, periods + 1);
}

export function periodsByDay(
  hours: BookingWorkingPeriodPublic[]
): BookingWorkingPeriodPublic[][] {
  const days: BookingWorkingPeriodPublic[][] = WEEKDAYS.map(() => []);
  for (const period of hours) {
    days[period.weekday]?.push(period);
  }
  for (const day of days) {
    day.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return days;
}

const HOURS_KEY = /^hours-([0-6])-(\d+)-(start|end)$/u;

export type HoursParse =
  | { ok: true; periods: BookingWorkingPeriodIn[] }
  | { ok: false; message: string };

function collectRows(
  entries: Iterable<[string, unknown]>
): Map<string, { start: string; end: string; day: number }> {
  const rows = new Map<string, { start: string; end: string; day: number }>();
  for (const [name, value] of entries) {
    const match = HOURS_KEY.exec(name);
    if (!match || typeof value !== "string") {
      continue;
    }
    const [, day = "0", row = "0", side = "start"] = match;
    const id = `${day}-${row}`;
    const current = rows.get(id) ?? { start: "", end: "", day: Number(day) };
    if (side === "start") {
      current.start = value.trim();
    } else {
      current.end = value.trim();
    }
    rows.set(id, current);
  }
  return rows;
}

/**
 * Reads `hours-<weekday>-<row>-<start|end>` fields. A row with both times
 * empty is skipped (a day with no rows is a day off); one time alone, an end
 * not after its start, or two overlapping rows on a day are refused with a
 * sentence naming the day.
 */
export function parseHours(entries: Iterable<[string, unknown]>): HoursParse {
  const rows = collectRows(entries);
  const periods: BookingWorkingPeriodIn[] = [];
  for (const row of rows.values()) {
    if (row.start === "" && row.end === "") {
      continue;
    }
    const name = WEEKDAYS[row.day];
    if (row.start === "" || row.end === "") {
      return {
        ok: false,
        message: `${name}: give both an opening and a closing time, or leave both empty.`,
      };
    }
    if (!(TIME.test(row.start) && TIME.test(row.end))) {
      return { ok: false, message: `${name}: use times like 09:00.` };
    }
    if (row.end <= row.start) {
      return {
        ok: false,
        message: `${name}: closing time must be after opening time.`,
      };
    }
    periods.push({
      weekday: row.day,
      start_time: row.start,
      end_time: row.end,
    });
  }
  periods.sort(
    (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)
  );
  for (let index = 1; index < periods.length; index += 1) {
    const before = periods[index - 1];
    const after = periods[index];
    if (
      before &&
      after &&
      before.weekday === after.weekday &&
      after.start_time < before.end_time
    ) {
      return {
        ok: false,
        message: `${WEEKDAYS[after.weekday]}: two periods overlap.`,
      };
    }
  }
  return { ok: true, periods };
}
