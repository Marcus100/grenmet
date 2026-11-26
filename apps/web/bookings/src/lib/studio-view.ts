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

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

/** The wall-clock time ("HH:MM", 24 hours) of an instant on the business's clock. */
export function localTime(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("hour")}:${pick("minute")}`;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

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
 * A time inside a spring-forward gap (it never happens on that clock) lands
 * one hour later; a repeated autumn time resolves to its first occurrence.
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

/**
 * Whether a booking asks for a part of the price (`deposit`) or all of it
 * (`payment`). The API decides (`payment_kind`); screens only word it.
 */
export type PaymentKind = "deposit" | "payment";

/** "Deposit" or "Payment", for labels. */
export function paymentWord(kind: PaymentKind = "deposit"): string {
  return kind === "payment" ? "Payment" : "Deposit";
}

const STATUS_VIEW: Record<BookingStatus, StatusView> = {
  pending_payment: { label: "Awaiting deposit", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "error" },
  no_show: { label: "No-show", tone: "error" },
  completed: { label: "Completed", tone: "info" },
};

export function statusView(
  status: BookingStatus,
  kind: PaymentKind = "deposit"
): StatusView {
  if (status === "pending_payment") {
    return {
      ...STATUS_VIEW[status],
      label: `Awaiting ${paymentWord(kind).toLowerCase()}`,
    };
  }
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

export function depositView(
  state: DepositState,
  kind: PaymentKind = "deposit"
): StatusView {
  const view = DEPOSIT_VIEW[state];
  return kind === "payment"
    ? {
        ...view,
        label: view.label
          .replace("Deposit", "Payment")
          .replace("deposit", "payment"),
      }
    : view;
}

/** One timeline line: "Pending to Confirmed", or "Created as Pending". */
export function eventLabel(
  from: BookingStatus | null,
  to: BookingStatus,
  kind: PaymentKind = "deposit"
): string {
  const next = statusView(to, kind).label;
  return from
    ? `${statusView(from, kind).label} to ${next}`
    : `Created as ${next}`;
}

/**
 * The agenda lists carry no payment amounts, so they can only say a deposit is
 * still awaited or show its size; the detail page shows paid and refunded.
 */
export function agendaDepositView(booking: {
  currency: string;
  deposit_minor: number;
  deposit_received_at?: string | null;
  payment_kind?: PaymentKind;
  status: BookingStatus;
}): StatusView {
  const kind = booking.payment_kind ?? "deposit";
  // Only a deposit paid to the business is ever marked received (#1869), so a
  // received mark is always a paid one. A cancelled booking is never shown as paid.
  if (booking.deposit_received_at && booking.status !== "cancelled") {
    return { label: "Deposit received", tone: "success" };
  }
  // The agenda item has no captured or refunded amount, so a cancelled booking
  // keeps the neutral amount label (never "due"); the detail page says what was paid.
  if (booking.status === "pending_payment") {
    return depositView("due", kind);
  }
  return {
    label: `${paymentWord(kind)} ${formatMoney(booking.deposit_minor, booking.currency)}`,
    tone: "neutral",
  };
}

export type BookingActionKey =
  | "confirm"
  | "reschedule"
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
      return ["confirm", "reschedule", "decline", "cancel"];
    case "confirmed":
      return started
        ? ["complete", "no_show", "cancel"]
        : ["reschedule", "cancel"];
    default:
      return [];
  }
}

/**
 * Whether a failed create should get a fresh idempotency key. Only an
 * unavailable result (timeout, 5xx) keeps it, so the retry replays a save that
 * may have gone through.
 */
export function rotatesKey(kind: string): boolean {
  return kind !== "unavailable";
}

/** Statuses in which the API still accepts a hand-recorded deposit. */
const DEPOSIT_OPEN: readonly BookingStatus[] = [
  "pending_payment",
  "pending",
  "confirmed",
];

/**
 * Whether the booking can take a deposit at all (it asks for one and is not
 * closed). The API decides the rest (a card payment may still be open).
 */
export function takesDeposit(booking: {
  deposit_minor: number;
  status: BookingStatus;
}): boolean {
  return booking.deposit_minor > 0 && DEPOSIT_OPEN.includes(booking.status);
}

/**
 * Whether the agenda row shows a deposit badge. A deposit paid to the business
 * carries no amount on the agenda item, so it shows only once it is received.
 */
export function showsAgendaDeposit(booking: {
  deposit_minor: number;
  deposit_received_at?: string | null;
  status: BookingStatus;
}): boolean {
  return (
    booking.deposit_minor > 0 ||
    (Boolean(booking.deposit_received_at) && booking.status !== "cancelled")
  );
}

/**
 * A deposit the customer pays the business by hand that is still owed: due
 * while the booking is pending or confirmed and nothing is recorded as received.
 * A cancelled booking owes nothing, so it is never due.
 */
export function businessDepositDue(booking: {
  deposit_received_at?: string | null;
  deposit_to_business_minor?: number;
  status: BookingStatus;
}): boolean {
  return (
    (booking.deposit_to_business_minor ?? 0) > 0 &&
    (booking.status === "pending" || booking.status === "confirmed") &&
    !booking.deposit_received_at
  );
}

/** "Deposit due EC$X to you", the agenda chip for a business deposit still owed. */
export function businessDepositDueView(booking: {
  currency: string;
  deposit_to_business_minor?: number;
}): StatusView {
  const amount = formatMoney(
    booking.deposit_to_business_minor ?? 0,
    booking.currency
  );
  return { label: `Deposit due ${amount} to you`, tone: "warning" };
}

export type DepositMethod = "cash" | "bank_transfer" | "paypal" | "other";

export const DEPOSIT_METHODS = [
  "cash",
  "bank_transfer",
  "paypal",
  "other",
] as const satisfies readonly DepositMethod[];

export const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  paypal: "PayPal",
  other: "Other",
};

/** Statuses in which a deposit paid to the business can be marked received (the API's rule). */
const BUSINESS_DEPOSIT_OPEN: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
];

/**
 * Whether staff can mark the deposit paid to the business as received: it asks
 * for one and the booking is pending, confirmed or completed. The API decides too.
 */
export function canMarkDepositReceived(booking: {
  deposit_received_at?: string | null;
  deposit_to_business_minor?: number;
  status: BookingStatus;
}): boolean {
  return (
    (booking.deposit_to_business_minor ?? 0) > 0 &&
    !booking.deposit_received_at &&
    BUSINESS_DEPOSIT_OPEN.includes(booking.status)
  );
}

/**
 * The detail page's badge for a deposit paid to the business. Received is the
 * only paid state; a cancelled booking is never "due".
 */
export function businessDepositView(booking: {
  deposit_received_at?: string | null;
  status: BookingStatus;
}): StatusView {
  if (booking.deposit_received_at) {
    return { label: "Deposit received", tone: "success" };
  }
  if (booking.status === "cancelled") {
    return { label: "Deposit cancelled", tone: "neutral" };
  }
  if (
    booking.status === "pending_payment" ||
    booking.status === "pending" ||
    booking.status === "confirmed"
  ) {
    return { label: "Deposit due", tone: "warning" };
  }
  return { label: "Deposit not received", tone: "neutral" };
}

const LOCAL_WHEN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/u;

/** A `datetime-local` value ("YYYY-MM-DDTHH:MM") read as the business's wall clock. */
export function parseLocalWhen(
  value: string
): { day: string; time: string } | null {
  const match = LOCAL_WHEN.exec(value);
  if (!match) {
    return null;
  }
  const [, day = "", time = ""] = match;
  return isDay(day) && isTime(time) ? { day, time } : null;
}

/** "Now" on the business's clock in `datetime-local` form: the latest value the form accepts. */
export function localWhenNow(timeZone: string, now: Date = new Date()): string {
  return `${todayIn(timeZone, now)}T${localTime(now, timeZone)}`;
}
