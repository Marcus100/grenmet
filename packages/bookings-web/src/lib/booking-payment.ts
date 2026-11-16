// What the customer paid when booking (Stripe test mode, #1372), in words, and
// the hand-off around the hosted checkout. Pure apart from sessionStorage, which
// is optional: every read and write is guarded and failing it only loses the
// automatic return to the manage page.

import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { formatMoney } from "./booking-format";

/** One line for the manage page and the confirmation. */
export function paymentLine(payment: BookingPaymentSummary): string {
  const amount = formatMoney(payment.amount_minor, payment.currency);
  switch (payment.status) {
    case "due":
      return `Payment of ${amount} not received yet. Your time is held until it arrives.`;
    case "paid":
      return payment.refunded_minor > 0
        ? `Paid ${formatMoney(payment.paid_minor, payment.currency)}; ${formatMoney(payment.refunded_minor, payment.currency)} refunded.`
        : `Paid ${formatMoney(payment.paid_minor, payment.currency)}. Thank you.`;
    case "refunded":
      return `Your payment of ${formatMoney(payment.paid_minor, payment.currency)} was refunded.`;
    default:
      return `The payment of ${amount} was not made.`;
  }
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
