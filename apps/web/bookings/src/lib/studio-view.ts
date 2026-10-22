// Pure helpers for the read-only studio screens: date ranges from the URL,
// status wording and the deposit state. No I/O, so the pages stay thin.

import type { BookingStatus, MembershipRole } from "@barrelsgd/api-client";
import {
  addDays,
  formatDay,
  formatMoney,
  localDay,
} from "@barrelsgd/bookings-web/lib/booking-format";

/** Used only until the business has a booking profile (no timezone yet); Grenada has no daylight saving. */
export const DEFAULT_TIMEZONE = "America/Grenada";

export type AgendaView = "day" | "week";

export interface AgendaRange {
  /** The day the person chose (any day inside the range). */
  day: string;
  from: string;
  to: string;
  view: AgendaView;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDay(value: string | undefined): value is string {
  if (!(value && DAY_PATTERN.test(value))) {
    return false;
  }
  return addDays(value, 0) === value;
}

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_PATTERN.test(value);
}

/** Monday of the week that holds `day`. */
export function weekStart(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function rangeFor(
  view: AgendaView,
  day: string
): { from: string; to: string } {
  if (view === "day") {
    return { from: day, to: day };
  }
  const from = weekStart(day);
  return { from, to: addDays(from, 6) };
}

/** Today's date on the business's own wall calendar, never the server's or browser's. */
export function todayIn(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): string {
  return localDay(now, timeZone);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTime(value: string | undefined): value is string {
  return value !== undefined && TIME_PATTERN.test(value);
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second")
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant (ISO string) for a wall-clock day and time in `timeZone`.
 * Staff type the time they see on the business's clock; the API wants UTC.
 */
export function zonedToUtcIso(
  day: string,
  time: string,
  timeZone: string
): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // Two passes settle the offset when the guess lands across a zone change.
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(first, timeZone);
  return new Date(second).toISOString();
}

/** Reads `view` and `date` from the URL, falling back to today's day view. */
export function parseRange(
  params: { view?: string; date?: string },
  today: string
): AgendaRange {
  const view: AgendaView = params.view === "week" ? "week" : "day";
  const day = isDay(params.date) ? params.date : today;
  return { view, day, ...rangeFor(view, day) };
}

export function stepDay(range: AgendaRange, direction: 1 | -1): string {
  return addDays(range.day, direction * (range.view === "week" ? 7 : 1));
}

export function rangeLabel(range: AgendaRange): string {
  if (range.view === "day") {
    return formatDay(range.day, true);
  }
  return `${formatDay(range.from)} to ${formatDay(range.to)}`;
}

/** Every day in the range, so a week shows its quiet days too. */
export function daysIn(range: AgendaRange): string[] {
  const days: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export type BadgeTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusView {
  label: string;
  tone: BadgeTone;
}

const STATUS_VIEW: Record<BookingStatus, StatusView> = {
  pending_payment: { label: "Awaiting deposit", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "error" },
  no_show: { label: "No-show", tone: "error" },
  completed: { label: "Completed", tone: "info" },
};

export function statusView(status: BookingStatus): StatusView {
  return STATUS_VIEW[status];
}

export type DepositState = "none" | "due" | "paid" | "refunded";

export function depositState(booking: {
  deposit_captured_minor: number;
  deposit_minor: number;
  deposit_refunded_minor: number;
}): DepositState {
  if (booking.deposit_minor <= 0) {
    return "none";
  }
  if (booking.deposit_refunded_minor > 0) {
    return "refunded";
  }
  return booking.deposit_captured_minor > 0 ? "paid" : "due";
}

const DEPOSIT_VIEW: Record<DepositState, StatusView> = {
  none: { label: "No deposit", tone: "neutral" },
  due: { label: "Deposit due", tone: "warning" },
  paid: { label: "Deposit paid", tone: "success" },
  refunded: { label: "Deposit refunded", tone: "info" },
};

export function depositView(state: DepositState): StatusView {
  return DEPOSIT_VIEW[state];
}

/** One timeline line: "Pending to Confirmed", or "Created as Pending". */
export function eventLabel(
  from: BookingStatus | null,
  to: BookingStatus
): string {
  const next = STATUS_VIEW[to].label;
  return from ? `${STATUS_VIEW[from].label} to ${next}` : `Created as ${next}`;
}

/**
 * The agenda lists carry no payment amounts, so they can only say a deposit is
 * still awaited or show its size; the detail page shows paid and refunded.
 */
export function agendaDepositView(booking: {
  deposit_minor: number;
  status: BookingStatus;
}): StatusView {
  if (booking.status === "pending_payment") {
    return DEPOSIT_VIEW.due;
  }
  return {
    label: `Deposit ${formatMoney(booking.deposit_minor)}`,
    tone: "neutral",
  };
}

export type BookingActionKey =
  | "confirm"
  | "decline"
  | "cancel"
  | "no_show"
  | "complete";

/** Owners and admins act on bookings; members see the agenda only. The API enforces it too. */
export function canManageBookings(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Buttons for a booking, mirroring the API's legal transitions
 * (`bookings/transitions.py`): a booking awaiting its deposit can only be
 * cancelled, a request can be confirmed, declined or cancelled, a confirmed
 * booking can be cancelled and, once it has started, marked completed or
 * no-show. Final statuses have none.
 */
export function availableActions(
  status: BookingStatus,
  started: boolean
): BookingActionKey[] {
  switch (status) {
    case "pending_payment":
      return ["cancel"];
    case "pending":
      return ["confirm", "decline", "cancel"];
    case "confirmed":
      return started ? ["complete", "no_show", "cancel"] : ["cancel"];
    default:
      return [];
  }
}
