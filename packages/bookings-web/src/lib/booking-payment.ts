// What the customer paid when booking (Stripe test mode, #1372), in words, and
// the hand-off around the hosted checkout. Pure apart from sessionStorage, which
// is optional: every read and write is guarded and failing it only loses the
// automatic return to the manage page.

import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { formatMoney } from "./booking-format";
import { depositRefundLine } from "./booking-policy";

/**
 * One line for the manage page and the confirmation. `accepted`: the business
 * accepted a request that is paid after acceptance, and names itself.
 */
export function paymentLine(
  payment: BookingPaymentSummary,
  accepted?: { businessName: string }
): string {
  const amount = formatMoney(payment.amount_minor, payment.currency);
  switch (payment.status) {
    case "due":
      if (accepted) {
        return `${accepted.businessName.trim() || "The business"} accepted your request. Pay ${amount} to confirm your booking.`;
      }
      return `Payment of ${amount} not received yet. Your time is held until it arrives.`;
    case "paid":
      if (payment.refunded_minor > 0) {
        return `Paid ${formatMoney(payment.paid_minor, payment.currency)}; ${formatMoney(payment.refunded_minor, payment.currency)} refunded.`;
      }
      // The balance is stated only once the deposit is paid; a full prepayment
      // leaves nothing to pay at the business.
      if (payment.balance_at_salon_minor > 0) {
        return `Deposit paid ${formatMoney(payment.paid_minor, payment.currency)}, remaining ${formatMoney(payment.balance_at_salon_minor, payment.currency)} at the salon.`;
      }
      return `Paid ${formatMoney(payment.paid_minor, payment.currency)}. Thank you.`;
    case "refunded":
      return `Your payment of ${formatMoney(payment.paid_minor, payment.currency)} was refunded.`;
    default:
      return `The payment of ${amount} was not made.`;
  }
}

/**
 * Money an online booking of the service pays when it is made (a deposit, or
 * the full price when the business takes it by card); more than 0 needs the
 * emailed code first. Older storefront data without the field falls back to
 * the deposit.
 */
export function dueAtBooking(
  service: { deposit_minor: number; due_at_booking_minor?: number } | null
): number {
  if (!service) {
    return 0;
  }
  return service.due_at_booking_minor ?? service.deposit_minor;
}

/**
 * Said before the customer submits: they pay now, and how much. A due amount
 * below the price is a deposit (the rest is paid at the business); otherwise it
 * is the full price. Empty when nothing is paid online at booking.
 */
export function payNowLine(
  dueMinor: number,
  priceMinor: number,
  currency: string,
  cutoffHours?: number,
  nonRefundable = false
): string | null {
  if (dueMinor <= 0) {
    return null;
  }
  const due = formatMoney(dueMinor, currency);
  if (dueMinor >= priceMinor) {
    return `You pay the full price, ${due}, now to hold this booking.`;
  }
  const deposit = `You pay a deposit of ${due} now to hold this booking. The rest is paid at the business.`;
  return cutoffHours === undefined
    ? deposit
    : `${deposit} ${depositRefundLine(cutoffHours, nonRefundable)}`;
}

/** A request that is paid by card only after the business accepts it. */
interface PaidAfterAcceptance {
  pay_after_acceptance?: boolean;
  status: string;
}

/**
 * The request is in and the business has not answered: nothing is paid or asked
 * yet, whatever amount the booking carries.
 */
export function awaitsAcceptance(booking: PaidAfterAcceptance): boolean {
  return booking.pay_after_acceptance === true && booking.status === "pending";
}

/** The business accepted the request and it now waits for the payment. */
export function acceptedAwaitingPayment(booking: PaidAfterAcceptance): boolean {
  return (
    booking.pay_after_acceptance === true &&
    booking.status === "pending_payment"
  );
}

/**
 * Said before the customer submits a request that is paid after acceptance:
 * nothing now, and how much follows. Empty when nothing will be due.
 */
export function payAfterAcceptanceLine(
  dueMinor: number,
  priceMinor: number,
  currency: string,
  businessName: string
): string | null {
  if (dueMinor <= 0) {
    return null;
  }
  const who = businessName.trim() || "the business";
  const due = formatMoney(dueMinor, currency);
  const what =
    dueMinor >= priceMinor
      ? `the full price, ${due}`
      : `a deposit of ${due} (the rest is paid at the business)`;
  return `Nothing to pay now. This is a request: if ${who} accepts it, we will email you to pay ${what}.`;
}

/**
 * On the confirmation and manage page while the request waits for the business:
 * nothing to pay yet, and what follows.
 */
export function payLaterLine(
  dueMinor: number,
  currency: string,
  businessName: string
): string {
  const who = businessName.trim() || "the business";
  const amount = dueMinor > 0 ? ` (${formatMoney(dueMinor, currency)})` : "";
  return `Nothing to pay yet. We will email you when ${who} accepts. You pay then${amount}.`;
}

/** The status text for a held booking: paid but not yet confirmed says so. */
export function paymentReceivedHeld(
  status: string,
  payment: BookingPaymentSummary | null | undefined
): boolean {
  return status === "pending_payment" && (payment?.paid_minor ?? 0) > 0;
}

/** The checkout address, only when it is a plain https link. */
export function safeCheckoutUrl(
  payment: BookingPaymentSummary | null | undefined
): string | null {
  const url = payment?.status === "due" ? payment.checkout_url : null;
  if (!url) {
    return null;
  }
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const KEY_PREFIX = "barrels.bookings.return.";

/**
 * Remember where the customer manages this booking before they leave for the
 * checkout. The manage token is never sent to the payment page, so the return
 * page reads it back from this tab only.
 */
export function rememberManagePath(bookingId: string, path: string): void {
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${bookingId}`, path);
  } catch {
    // Storage blocked: the return page explains how to find the booking.
  }
}

/** The remembered manage path for a booking: a same-site path, else null. */
export function recallManagePath(bookingId: string): string | null {
  let path: string | null = null;
  try {
    path = window.sessionStorage.getItem(`${KEY_PREFIX}${bookingId}`);
  } catch {
    return null;
  }
  if (!path?.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return null;
  }
  return path;
}
