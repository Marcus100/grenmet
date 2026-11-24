// Plain sentences about a booking's rules: the cancellation cutoff and an unpaid
// hold. Shared by the confirmation and the manage page so both say the same.

import { formatDateTime, formatHours } from "./booking-format";

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
