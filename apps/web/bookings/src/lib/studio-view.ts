// Pure helpers for the read-only studio screens: date ranges from the URL,
// status wording and the deposit state. No I/O, so the pages stay thin.

import type { BookingStatus, MembershipRole } from "@barrelsgd/api-client";
import {
  addDays,
  formatDateTime,
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

/** The API's history notes for a deposit paid to the business (`studio.py`). */
const DEPOSIT_RECEIVED_NOTE = "Deposit received";
const DEPOSIT_UNDONE_NOTE = "Deposit receipt undone";
/** "Rescheduled from 2026-11-20T14:00Z by the business" (or "by customer"). */
const RESCHEDULED_NOTE =
  /^Rescheduled from (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z by (the business|customer)$/u;
/** "Deposit recorded by hand (cash)", or "Payment recorded by hand (cash)". */
const RECORDED_NOTE = /^(Deposit|Payment) recorded by hand \(.+\)$/u;
/** "Deposit refunded", "Payment refund queued", "Deposit refund failed; ...". */
const REFUND_NOTE = /\brefund/iu;

export interface TimelineEvent {
  created_at: string;
  from_status: BookingStatus | null;
  note: string | null;
  to_status: BookingStatus;
}

export interface TimelineEntry {
  /** The line under the time, or null when the title already says it. */
  detail: string | null;
  title: string;
}

/** One entry as the page lists it: when it happened and a key unique in the list. */
export interface TimelineRow extends TimelineEntry {
  at: string;
  key: string;
}

export interface TimelineContext {
  kind?: PaymentKind;
  /**
   * The start the booking moved to, for a reschedule entry: the API's note
   * holds only the old one. Null when it is not known.
   */
  newStart?: string | null;
  /** The business's time zone; times are written the way the page writes them. */
  zone: string;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The old start in a reschedule note, as an instant; null when it is not one. */
function rescheduledFrom(note: string | null): string | null {
  const match = note ? RESCHEDULED_NOTE.exec(note) : null;
  if (!match) {
    return null;
  }
  const iso = `${match[1]}:00Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function rescheduleEntry(
  note: string,
  oldStart: string,
  context: TimelineContext
): TimelineEntry {
  const who = note.endsWith("by customer") ? "the customer" : "the business";
  const from = formatDateTime(oldStart, context.zone);
  const to = context.newStart
    ? ` to ${formatDateTime(context.newStart, context.zone)}`
    : "";
  return { title: "Time changed", detail: `From ${from}${to}, by ${who}` };
}

/** An entry whose status stays the same and is not a deposit receipt or a reschedule. */
function sameStatusEntry(event: TimelineEvent, note: string): TimelineEntry {
  const recorded = RECORDED_NOTE.exec(note);
  if (recorded) {
    return { title: `${recorded[1]} recorded`, detail: note };
  }
  if (REFUND_NOTE.test(note)) {
    return { title: "Refund", detail: note };
  }
  if (event.to_status === "cancelled") {
    // "Deposit kept", "Unpaid deposit cancelled": what happened to the money.
    return { title: "Cancellation note", detail: note };
  }
  return { title: "Booking updated", detail: note };
}

/**
 * The title and detail of one timeline entry. Only a real change of status is
 * titled "X to Y". An entry whose status stays the same is titled by what
 * happened ("Deposit received", "Time changed", "Refund"), so "Confirmed to
 * Confirmed" is never shown, and a note this does not recognise is shown as
 * the detail under "Booking updated", never as a title.
 */
export function timelineEntry(
  event: TimelineEvent,
  context: TimelineContext
): TimelineEntry {
  const note = event.note?.trim() || null;
  if (event.from_status !== event.to_status) {
    return {
      title: eventLabel(event.from_status, event.to_status, context.kind),
      detail: note,
    };
  }
  if (note === null) {
    return { title: "Booking updated", detail: null };
  }
  if (note === DEPOSIT_UNDONE_NOTE) {
    return { title: "Deposit marked not received", detail: null };
  }
  if (note.startsWith(DEPOSIT_RECEIVED_NOTE)) {
    // "Deposit received by cash" keeps its method as the detail: "By cash".
    const method = note.slice(DEPOSIT_RECEIVED_NOTE.length).trim();
    return {
      title: DEPOSIT_RECEIVED_NOTE,
      detail: method ? capitalised(method) : null,
    };
  }
  const oldStart = rescheduledFrom(note);
  if (oldStart) {
    return rescheduleEntry(note, oldStart, context);
  }
  return sameStatusEntry(event, note);
}

/**
 * Every timeline entry, in the order given (the API's: oldest first). A
 * reschedule's new time is the old time of the next reschedule, or the
 * booking's start now for the last one.
 */
export function timelineEntries(
  events: TimelineEvent[],
  booking: { kind?: PaymentKind; startsAt: string; zone: string }
): TimelineRow[] {
  const seen = new Map<string, number>();
  return events.map((event, index) => {
    // Two entries can share a time and a status, so the key counts repeats.
    const stem = `${event.created_at}-${event.to_status}`;
    const repeat = seen.get(stem) ?? 0;
    seen.set(stem, repeat + 1);
    const later = events
      .slice(index + 1)
      .map((next) =>
        next.from_status === next.to_status ? rescheduledFrom(next.note) : null
      )
      .find((start) => start !== null);
    return {
      ...timelineEntry(event, {
        kind: booking.kind,
        zone: booking.zone,
        newStart: later ?? booking.startsAt,
      }),
      at: event.created_at,
      key: `${stem}-${repeat}`,
    };
  });
}

/**
 * Cancelled bookings, whose unpaid business-collected deposit is hidden on the
 * agenda. A no-show is not here: the business may still want the unpaid deposit
 * or a late fee, so it keeps the chip it has on `dev`.
 */
const CANCELLED_UNPAID = "cancelled";

/** The money the agenda row carries for an online deposit (0 when none was taken). */
interface AgendaDepositMoney {
  deposit_captured_minor?: number;
  deposit_refunded_minor?: number;
}

/** Statuses where the booking will not happen, so an online deposit taken is settled by refund. */
const CLOSED_STATUSES: readonly BookingStatus[] = ["cancelled", "no_show"];

/**
 * The refund chip for a cancelled or no-show booking whose online deposit was
 * taken: "Refunded" once all that was taken is handed back, otherwise "Refund
 * owed" with the amount still to return. Null when no online money was taken,
 * so the row shows nothing.
 */
export function refundView(
  booking: AgendaDepositMoney & { currency: string }
): StatusView | null {
  const captured = booking.deposit_captured_minor ?? 0;
  if (captured <= 0) {
    return null;
  }
  const refunded = booking.deposit_refunded_minor ?? 0;
  if (refunded >= captured) {
    return { label: "Refunded", tone: "info" };
  }
  return {
    label: `Refund owed ${formatMoney(captured - refunded, booking.currency)}`,
    tone: "warning",
  };
}

/**
 * The agenda row's deposit chip. A booking still awaiting its deposit says so; a
 * cancelled or no-show booking shows its refund state from the captured and
 * refunded amounts (nothing when no online money was taken, see
 * `showsAgendaDeposit`). Otherwise the amount shows, neutral.
 */
export function agendaDepositView(
  booking: AgendaDepositMoney & {
    currency: string;
    deposit_minor: number;
    deposit_received_at?: string | null;
    payment_kind?: PaymentKind;
    status: BookingStatus;
  }
): StatusView {
  const kind = booking.payment_kind ?? "deposit";
  // Only money the business actually received is marked received, so a received
  // mark is always a paid one, on any status.
  if (booking.deposit_received_at) {
    return { label: `${paymentWord(kind)} received`, tone: "success" };
  }
  if (booking.status === "pending_payment") {
    return depositView("due", kind);
  }
  if (CLOSED_STATUSES.includes(booking.status)) {
    const refund = refundView(booking);
    if (refund) {
      return refund;
    }
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
 * Whether the agenda row shows a deposit badge. Received always shows. A
 * cancelled booking shows only an online deposit that was taken (its refund
 * state, `refundView`): a never-paid or business-collected deposit shows nothing,
 * because Barrels never held it. Anything else shows its amount when
 * `deposit_minor` is above 0, as on `dev`.
 */
export function showsAgendaDeposit(
  booking: AgendaDepositMoney & {
    deposit_minor: number;
    deposit_to_business_minor?: number;
    deposit_received_at?: string | null;
    status: BookingStatus;
  }
): boolean {
  if (booking.deposit_received_at) {
    return true;
  }
  if (booking.status === CANCELLED_UNPAID) {
    // The refund state shows only when online money was taken (`refundView`).
    return (booking.deposit_captured_minor ?? 0) > 0;
  }
  return booking.deposit_minor > 0;
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

/** What the API says about a request that is paid by card after acceptance. */
interface AcceptanceFields {
  accepted_at?: string | null;
  pay_after_acceptance?: boolean;
  status: BookingStatus;
}

/**
 * A request you accepted that now waits for the customer's payment: the hold
 * started when you accepted, and paying confirms the booking.
 */
export function acceptedAwaitingPayment(booking: AcceptanceFields): boolean {
  return (
    booking.pay_after_acceptance === true &&
    booking.status === "pending_payment" &&
    Boolean(booking.accepted_at)
  );
}

/** A request the customer pays for only after you accept it: nothing is paid yet. */
export function paysAfterYouAccept(
  booking: AcceptanceFields & { deposit_minor: number }
): boolean {
  return (
    booking.pay_after_acceptance === true &&
    booking.status === "pending" &&
    booking.deposit_minor > 0
  );
}

/** "Accepted, awaiting payment": the state between your yes and the money. */
export const ACCEPTED_AWAITING_VIEW: StatusView = {
  label: "Accepted, awaiting payment",
  tone: "warning",
};

/** "Deposit EC$50 after you accept", the chip on a request that pays later. */
export function payAfterAcceptView(booking: {
  currency: string;
  deposit_minor: number;
  payment_kind?: PaymentKind;
}): StatusView {
  const amount = formatMoney(booking.deposit_minor, booking.currency);
  return {
    label: `${paymentWord(booking.payment_kind ?? "deposit")} ${amount} after you accept`,
    tone: "neutral",
  };
}

/**
 * "Deposit EC$50 to you after you accept": a request whose deposit is paid to
 * the business. The customer is asked to pay only once you accept.
 */
export function businessDepositAfterAcceptView(booking: {
  currency: string;
  deposit_to_business_minor?: number;
}): StatusView {
  const amount = formatMoney(
    booking.deposit_to_business_minor ?? 0,
    booking.currency
  );
  return {
    label: `Deposit ${amount} to you after you accept`,
    tone: "neutral",
  };
}

/** A chip on an agenda row: the hold warning, or the deposit line. */
export type AgendaChip =
  | { kind: "expires_soon" }
  | { kind: "deposit"; view: StatusView };

/**
 * The chips for one agenda row, in order. A business deposit still owed replaces
 * the generic deposit chip; otherwise the generic chip shows as before. The
 * business-due rule is evaluated once per row.
 */
export function agendaChips(
  booking: Parameters<typeof agendaDepositView>[0] & {
    accepted_at?: string | null;
    deposit_to_business_minor?: number;
    hold_expires_soon?: boolean;
    pay_after_acceptance?: boolean;
  }
): AgendaChip[] {
  const chips: AgendaChip[] = [];
  if (booking.hold_expires_soon) {
    chips.push({ kind: "expires_soon" });
  }
  const businessDue = businessDepositDue(booking);
  if (acceptedAwaitingPayment(booking)) {
    chips.push({ kind: "deposit", view: ACCEPTED_AWAITING_VIEW });
  } else if (paysAfterYouAccept(booking)) {
    chips.push({ kind: "deposit", view: payAfterAcceptView(booking) });
  } else if (businessDue && booking.status === "pending") {
    chips.push({
      kind: "deposit",
      view: businessDepositAfterAcceptView(booking),
    });
  } else if (businessDue) {
    chips.push({ kind: "deposit", view: businessDepositDueView(booking) });
  } else if (showsAgendaDeposit(booking)) {
    chips.push({ kind: "deposit", view: agendaDepositView(booking) });
  }
  return chips;
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
