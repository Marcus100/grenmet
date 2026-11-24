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

/** Said while the amount for the chosen add-ons is being fetched. */
export const AMOUNT_LOADING = "Working out what is due…";

/** Said instead of an amount while the API has not told the form what is due. */
export const DEPOSIT_ON_TOTAL =
  "Deposit worked out on the total; you will see the amount before you pay.";

export interface BookingRulesInput {
  /** The amount is being fetched: say so, neutrally, instead of guessing. */
  amountLoading?: boolean;
  /**
   * The booking's status on the manage page. Leave it out on the booking form,
   * where nothing is booked yet and a non-refundable deposit only becomes
   * non-refundable once the business confirms.
   */
  bookingStatus?: string;
  /** The business's display name, for "contact ..." once online changes close. */
  businessName?: string;
  currency: string;
  /** Hours before the start that online changes and cancellations close; 0 = none. */
  cutoffHours: number;
  /**
   * Add-ons are ticked and the API works the deposit out on the combined price,
   * so no amount is stated (see `amountDueForSelection`).
   */
  depositOnTotal?: boolean;
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

/**
 * The change and cancel rule. Online changes and cancellations close at the
 * cut-off (the API answers 409 after it), so later ones go to the business.
 */
function changeClause(input: BookingRulesInput): string {
  if (input.cutoffHours <= 0) {
    return "Change or cancel online any time before it starts.";
  }
  const who = input.businessName ?? "the business";
  return `Change or cancel online up to ${formatHours(input.cutoffHours)} before; after that, contact ${who}.`;
}

/** What happens to a paid deposit, as the end of the sentence that names it. */
function refundClause(input: BookingRulesInput): string {
  const { bookingStatus, cutoffHours, nonRefundable = false } = input;
  if (nonRefundable) {
    if (bookingStatus === undefined) {
      return "not refundable once your booking is confirmed.";
    }
    if (bookingStatus === "confirmed") {
      return "not refundable.";
    }
  }
  // Inside the cut-off the API keeps the deposit (a request not yet accepted
  // follows the same rule), so the condition is part of the claim.
  return cutoffHours <= 0
    ? "refunded if you cancel before it starts."
    : `refunded if you cancel at least ${formatHours(cutoffHours)} before it starts.`;
}

/** The whole rules line when a deposit or payment is taken online. */
function paidOnlineLine(input: BookingRulesInput, dueMinor: number): string {
  if (input.bookingStatus === "pending_payment") {
    // Nothing has been captured yet, so no refund claim is made.
    return `No deposit has been taken yet. ${changeClause(input)}`;
  }
  const amount = formatMoney(dueMinor, input.currency);
  const paidInFull =
    input.priceMinor !== undefined && dueMinor >= input.priceMinor;
  const noun = paidInFull
    ? `${amount} paid when you book`
    : `${amount} deposit`;
  return `${noun}, ${refundClause(input)} ${changeClause(input)}`;
}

/** The money part when nothing is paid online; empty before a service is chosen. */
function moneyClause(input: BookingRulesInput): string {
  const { currency, dueMinor } = input;
  if (dueMinor === undefined) {
    return "";
  }
  if ((input.ownDepositMinor ?? 0) > 0) {
    return `${formatMoney(input.ownDepositMinor ?? 0, currency)} deposit, paid at the salon.`;
  }
  return "No deposit for this service.";
}

/**
 * The one plain line beside the Book button and on the manage page: what is
 * paid up front, whether it comes back, and until when a booking can change.
 * "EC$40 deposit, not refundable once your booking is confirmed. Change or
 * cancel up to 24 hours before."
 */
export function bookingRulesLine(input: BookingRulesInput): string {
  if (input.amountLoading) {
    return `${AMOUNT_LOADING} ${changeClause(input)}`;
  }
  if (input.depositOnTotal) {
    return `${DEPOSIT_ON_TOTAL} ${changeClause(input)}`;
  }
  if (input.dueMinor !== undefined && input.dueMinor > 0) {
    return paidOnlineLine(input, input.dueMinor);
  }
  return [moneyClause(input), changeClause(input)].filter(Boolean).join(" ");
}
