// Plain sentences about a booking's rules: the cancellation cutoff and an unpaid
// hold. Shared by the confirmation and the manage page so both say the same.

import { formatDateTime, formatHours, formatMoney } from "./booking-format";

/**
 * The cancellation rule in one sentence, from the business's cutoff in hours.
 * Zero means the booking can be changed until the appointment starts.
 */
export function cancellationPolicyLine(cutoffHours: number): string {
  if (cutoffHours <= 0) {
    return "You can cancel or change this booking online until it starts.";
  }
  return `You can cancel or change this booking online until ${formatHours(cutoffHours)} before it starts.`;
}

/**
 * The refund rule for a deposit, in one sentence. The cutoff comes from the
 * business (`cancel_cutoff_hours`), never a fixed number of hours. A
 * non-refundable business says that instead: a move keeps the deposit.
 */
export function depositRefundLine(
  cutoffHours: number,
  nonRefundable = false,
  confirmed = false
): string {
  if (nonRefundable) {
    return nonRefundableDepositLine(cutoffHours, confirmed);
  }
  if (cutoffHours <= 0) {
    return "Cancel before your appointment starts to get your deposit back.";
  }
  return `Cancel at least ${formatHours(cutoffHours)} before to get your deposit back.`;
}

/**
 * A non-refundable deposit, in one sentence. Until the business confirms the
 * booking the promise waits for it: a request cancelled before then is refunded.
 * The customer can still move the booking up to the cutoff, and the deposit moves
 * with it.
 */
export function nonRefundableDepositLine(
  cutoffHours: number,
  confirmed = false
): string {
  const lead = confirmed
    ? "Your deposit is non-refundable"
    : "Your deposit is non-refundable once your booking is confirmed";
  if (cutoffHours <= 0) {
    return `${lead}. You can move your booking at any time before it starts; it stays with your booking.`;
  }
  return `${lead}. You can move your booking up to ${formatHours(cutoffHours)} before; it stays with your booking.`;
}

/**
 * When an unpaid hold is released, in the business's timezone. Shown only while
 * the booking waits for payment.
 */
export function holdEndsLine(holdEndsAt: string, timeZone: string): string {
  return `Your time is held until ${formatDateTime(holdEndsAt, timeZone)}. It is released if the payment has not arrived by then.`;
}

export interface BookingRulesInput {
  currency: string;
  /** Hours before the start that online changes and cancellations close; 0 = none. */
  cutoffHours: number;
  /**
   * Money paid online when the booking is made (storefront
   * `due_at_booking_minor`, or the booking's stored deposit). It already folds
   * in the business rule, the minimum price, the service's own deposit and
   * whether a payment route exists. Leave it out before a service is chosen.
   */
  dueMinor?: number;
  /** The booking's own `deposit_non_refundable` (the business's, as stored). */
  nonRefundable?: boolean;
  /**
   * The service's own deposit, used only when nothing is paid online: with no
   * payment route the deposit is settled at the salon.
   */
  ownDepositMinor?: number;
  priceMinor?: number;
}

/** The change and cancel rule as a short sentence. */
function changeClause(cutoffHours: number): string {
  if (cutoffHours <= 0) {
    return "Change or cancel any time before it starts.";
  }
  return `Change or cancel up to ${formatHours(cutoffHours)} before.`;
}

/** The money part of the rules line; empty before a service is chosen. */
function moneyClause(input: BookingRulesInput): string {
  const { currency, dueMinor, nonRefundable = false } = input;
  if (dueMinor === undefined) {
    return "";
  }
  if (dueMinor > 0) {
    const amount = formatMoney(dueMinor, currency);
    const paidInFull =
      input.priceMinor !== undefined && dueMinor >= input.priceMinor;
    const noun = paidInFull
      ? `${amount} paid when you book`
      : `${amount} deposit`;
    return `${noun}, ${nonRefundable ? "not refundable" : "refundable"}.`;
  }
  if ((input.ownDepositMinor ?? 0) > 0) {
    return `${formatMoney(input.ownDepositMinor ?? 0, currency)} deposit, paid at the salon.`;
  }
  return "No deposit for this service.";
}

/**
 * The one plain line beside the Book button and on the manage page: what is
 * paid up front, whether it comes back, and until when a booking can change.
 * "EC$40 deposit, not refundable. Change or cancel up to 24 hours before."
 */
export function bookingRulesLine(input: BookingRulesInput): string {
  return [moneyClause(input), changeClause(input.cutoffHours)]
    .filter(Boolean)
    .join(" ");
}
