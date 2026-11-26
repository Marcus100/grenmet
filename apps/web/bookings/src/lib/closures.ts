// Pure helpers for the Closed days section: the rule that a closure ends on or
// after its first day, the API's field errors, the wording of each row and the
// bookings the API reports inside a new closure. No I/O, so the rules are
// testable alone and client components can import this file.
//
// Closures are whole local days (`YYYY-MM-DD` on the business clock), so no
// timezone conversion happens here: the API reads the days as they are typed.

import type {
  BookingClosureCreated,
  BookingClosurePublic,
} from "@barrelsgd/api-client";
import { formatDay } from "@barrelsgd/bookings-web/lib/booking-format";
import type { FormState } from "@barrelsgd/ui/lib/form-state";
import type { StudioFailure } from "@/lib/studio-errors";
import { isDay } from "@/lib/studio-view";

/** The API's limit on one closure (`MAX_CLOSURE_DAYS`, both ends counted). */
export const MAX_CLOSURE_DAYS = 366;
/** The API's limit on a reason (`BookingClosureCreate`). */
export const CLOSURE_REASON_MAX = 200;

const MAX_DAYS_MESSAGE = `A closure can cover at most ${MAX_CLOSURE_DAYS} days.`;
const END_BEFORE_START_MESSAGE = "The end date can't be before the start date.";

/** The fields of the add form that the browser or the API can refuse. */
export interface ClosureFieldErrors {
  endsOn?: string;
  reason?: string;
  startsOn?: string;
}

/** A booking inside a new closure, as the studio shows it after saving. */
export interface ClosureAffectedBooking {
  customerFirstName: string | null;
  id: string;
  startsAt: string;
}

/** What the closure actions hand back: a save may list the bookings it touches. */
export type ClosureState = FormState<
  { affected?: ClosureAffectedBooking[]; message: string },
  StudioFailure & { fields?: ClosureFieldErrors }
>;

export type ClosureWindow =
  | { endsOn: string; ok: true; startsOn: string }
  | { fields: ClosureFieldErrors; message: string; ok: false };

/** The number of local days from `startsOn` to `endsOn`, both counted. */
export function closureDays(startsOn: string, endsOn: string): number {
  const [sy = 0, sm = 1, sd = 1] = startsOn.split("-").map(Number);
  const [ey = 0, em = 1, ed = 1] = endsOn.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * The closure's days, checked before anything is sent. Both days are needed,
 * the last day is not before the first, and the closure covers at most a year.
 * Each refusal names the field at fault.
 */
export function closureWindow(startsOn: string, endsOn: string): ClosureWindow {
  const fields: ClosureFieldErrors = {};
  const start = isDay(startsOn.trim()) ? startsOn.trim() : null;
  const end = isDay(endsOn.trim()) ? endsOn.trim() : null;
  if (!start) {
    fields.startsOn = "Choose the first closed day.";
  }
  if (!end) {
    fields.endsOn = "Choose the last closed day.";
  }
  if (start && end) {
    if (end < start) {
      fields.endsOn = END_BEFORE_START_MESSAGE;
    } else if (closureDays(start, end) > MAX_CLOSURE_DAYS) {
      fields.endsOn = MAX_DAYS_MESSAGE;
    } else {
      return { ok: true, startsOn: start, endsOn: end };
    }
  }
  return { ok: false, fields, message: "Check the closed days." };
}

const FIELD_BY_LOC: Record<string, keyof ClosureFieldErrors> = {
  starts_on: "startsOn",
  ends_on: "endsOn",
  reason: "reason",
};

/** Pydantic prefixes its own words ("Value error, "); the person should not see them. */
const VALUE_ERROR_PREFIX = /^Value error, /u;
const BEFORE_START = /must not be before/u;
const TOO_MANY_DAYS = /at most \d+ days/u;

function fieldMessage(key: keyof ClosureFieldErrors, text: string): string {
  const plain = text.replace(VALUE_ERROR_PREFIX, "").trim();
  if (key === "endsOn" && BEFORE_START.test(plain)) {
    return END_BEFORE_START_MESSAGE;
  }
  if (key === "endsOn" && TOO_MANY_DAYS.test(plain)) {
    return MAX_DAYS_MESSAGE;
  }
  if (plain === "") {
    return key === "reason" ? "Check the reason." : "Check this date.";
  }
  return `${plain.charAt(0).toUpperCase()}${plain.slice(1)}.`;
}

/**
 * The API's request-validation errors as field messages. An item names its
 * field in `loc`; the model-level rules (the end before the start, the year
 * limit) arrive as a body item, so their text decides which field they belong
 * to. Anything that cannot be pointed at is left out.
 */
export function closureFieldErrors(
  data: unknown
): ClosureFieldErrors | undefined {
  if (
    typeof data !== "object" ||
    data === null ||
    !("errors" in data) ||
    !Array.isArray(data.errors)
  ) {
    return undefined;
  }
  const fields: ClosureFieldErrors = {};
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
    let key = part === undefined ? undefined : FIELD_BY_LOC[part];
    if (
      key === undefined &&
      (BEFORE_START.test(item.msg) || TOO_MANY_DAYS.test(item.msg))
    ) {
      key = "endsOn";
    }
    if (key && fields[key] === undefined) {
      fields[key] = fieldMessage(key, item.msg);
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** "Friday, 25 December 2026" for one day, "Friday, 25 December 2026 to Sunday, 27 December 2026" for a run. */
export function closureSpanLabel(
  item: Pick<BookingClosurePublic, "ends_on" | "starts_on">
): string {
  const first = formatDay(item.starts_on, true);
  if (item.starts_on === item.ends_on) {
    return first;
  }
  return `${first} to ${formatDay(item.ends_on, true)}`;
}

/**
 * The closures that are still running or still to come, earliest first. The
 * API lists every closure the business has had, so past ones are dropped here.
 */
export function upcomingClosures(
  closures: readonly BookingClosurePublic[],
  today: string
): BookingClosurePublic[] {
  return closures
    .filter((item) => item.ends_on >= today)
    .sort((a, b) =>
      a.starts_on === b.starts_on
        ? a.id.localeCompare(b.id)
        : a.starts_on.localeCompare(b.starts_on)
    );
}

/** The created closure's bookings in the shape the form shows. */
export function affectedBookings(
  created: Pick<BookingClosureCreated, "affected_bookings">
): ClosureAffectedBooking[] {
  return (created.affected_bookings ?? []).map((item) => ({
    customerFirstName: item.customer_first_name ?? null,
    id: item.id,
    startsAt: item.starts_at,
  }));
}
