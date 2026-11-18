import type { BookingPaymentSummary } from "@barrelsgd/api-client";

const MINOR_PER_MAJOR = 100;

/** "EC$225" or "EC$22.50"; other currencies show their code first. */
function money(minor: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const major = minor / MINOR_PER_MAJOR;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return code === "XCD" ? `EC$${text}` : `${code} ${text}`;
}

/**
 * The money state of one booking in plain words, or null when nothing was due
 * at booking (the customer pays at the business).
 */
export function bookingPaymentLine(
  payment: BookingPaymentSummary | null | undefined
): string | null {
  if (!payment) {
    return null;
  }
  const { currency } = payment;
  switch (payment.status) {
    case "due":
      return `Payment of ${money(payment.amount_minor, currency)} not received yet`;
    case "paid":
      return payment.refunded_minor > 0
        ? `Paid ${money(payment.paid_minor, currency)}, ${money(payment.refunded_minor, currency)} refunded`
        : `Paid ${money(payment.paid_minor, currency)}`;
    case "refunded":
      return `Payment of ${money(payment.paid_minor, currency)} refunded`;
    default:
      return `Payment of ${money(payment.amount_minor, currency)} was not made`;
  }
}
