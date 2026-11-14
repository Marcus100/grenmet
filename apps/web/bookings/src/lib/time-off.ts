// Pure helpers for the time-off section: the form's wall-clock times on the
// business clock, the rule that a range ends after it starts, the API's field
// errors and the wording of each row. No I/O, so the rules are testable alone
// and client components can import this file.

import type {
  BookingExceptionKind,
  BookingExceptionPublic,
} from "@barrelsgd/api-client";
import { formatDateTime } from "@barrelsgd/bookings-web/lib/booking-format";
import type { FormState } from "@barrelsgd/ui/lib/form-state";
import type { StudioFailure } from "@/lib/studio-errors";
import { isDay, zonedToUtcIso } from "@/lib/studio-view";

/** The fields of the add form that the API or the rules can refuse. */
export interface TimeOffFieldErrors {
  endsAt?: string;
  reason?: string;
  startsAt?: string;
}

/** What the time-off actions hand back: a failure can name the fields it refuses. */
export type TimeOffState = FormState<
  { message: string },
  StudioFailure & { fields?: TimeOffFieldErrors }
>;

const KIND_LABEL: Record<BookingExceptionKind, string> = {
  time_off: "Time off",
  extra_hours: "Extra hours",
};

export function kindLabel(kind: BookingExceptionKind): string {
  return KIND_LABEL[kind];
}

/** "Friday 20 November 2026, 9:00 am to Friday 20 November 2026, 5:00 pm", on the business clock. */
export function spanLabel(
  item: Pick<BookingExceptionPublic, "ends_at" | "starts_at">,
  zone: string
): string {
  return `${formatDateTime(item.starts_at, zone)} to ${formatDateTime(item.ends_at, zone)}`;
}

const LOCAL = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/u;

/** A `datetime-local` value ("2026-11-20T09:00") split into its day and time. */
export function parseLocal(
  value: string
): { day: string; time: string } | null {
  const match = LOCAL.exec(value.trim());
  if (!(match && isDay(match[1]))) {
    return null;
  }
  return { day: match[1] ?? "", time: `${match[2]}:${match[3]}` };
}

export type TimeOffWindow =
  | { ok: true; endsAt: string; startsAt: string }
  | { fields: TimeOffFieldErrors; message: string; ok: false };

/**
 * The UTC window for a range typed on the business clock. Both ends are
 * required and the end must be after the start; the field that is wrong gets
 * its own sentence.
 */
export function timeOffWindow(
  startLocal: string,
  endLocal: string,
  zone: string
): TimeOffWindow {
  const start = parseLocal(startLocal);
  const end = parseLocal(endLocal);
  const fields: TimeOffFieldErrors = {};
  if (!start) {
    fields.startsAt = "Enter the start as a date and time.";
  }
  if (!end) {
    fields.endsAt = "Enter the end as a date and time.";
  }
  if (start && end) {
    const startsAt = zonedToUtcIso(start.day, start.time, zone);
    const endsAt = zonedToUtcIso(end.day, end.time, zone);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      fields.endsAt = "The end must be after the start.";
    } else {
      return { ok: true, startsAt, endsAt };
    }
  }
  return {
    ok: false,
    fields,
    message: "Check the start and end times.",
  };
}

const FIELD_BY_LOC: Record<string, keyof TimeOffFieldErrors> = {
  starts_at: "startsAt",
  ends_at: "endsAt",
  reason: "reason",
};

/**
 * The API's request-validation errors as field messages. Each item's `loc`
 * ends in the field name ("body", "ends_at"); an item for another field is
 * left out, so the form shows only what it can point at.
 */
export function timeOffFieldErrors(
  data: unknown
): TimeOffFieldErrors | undefined {
  if (
    typeof data !== "object" ||
    data === null ||
    !("errors" in data) ||
    !Array.isArray(data.errors)
  ) {
    return undefined;
  }
  const fields: TimeOffFieldErrors = {};
  for (const item of data.errors) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("loc" in item) ||
      !Array.isArray(item.loc) ||
      !("msg" in item) ||
      typeof item.msg !== "string"
    ) {
      continue;
    }
    const location: unknown[] = item.loc;
    const part = location.find(
      (value): value is string =>
        typeof value === "string" && value in FIELD_BY_LOC
    );
    const key = part === undefined ? undefined : FIELD_BY_LOC[part];
    if (key && fields[key] === undefined) {
      fields[key] = fieldMessage(key, item.msg);
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** Pydantic prefixes its own words ("Value error, "); the person should not see them. */
const VALUE_ERROR_PREFIX = /^Value error, /u;
const MUST_BE_AFTER = /must be after/u;

function fieldMessage(key: keyof TimeOffFieldErrors, text: string): string {
  const plain = text.replace(VALUE_ERROR_PREFIX, "").trim();
  if (key === "endsAt" && MUST_BE_AFTER.test(plain)) {
    return "The end must be after the start.";
  }
  if (plain === "") {
    return key === "reason" ? "Check the reason." : "Check this date and time.";
  }
  return `${plain.charAt(0).toUpperCase()}${plain.slice(1)}.`;
}
