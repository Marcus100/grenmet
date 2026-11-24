// The business's own booking policy (late fees and so on), as plain text. React
// escapes it, and the line breaks the business typed are kept.

import { depositRefundLine } from "../lib/booking-policy";

export function BookingPolicyText({ text }: { text?: string | null }) {
  if (!text) {
    return null;
  }
  return <div className="muted whitespace-pre-line">{text}</div>;
}

/**
 * The refund promise for a deposit on a booking that can still change. Shown only
 * while the booking is editable and a deposit was due at booking.
 */
export function DepositRefundNote({
  booking,
  editable,
}: {
  booking: {
    cancel_cutoff_hours: number;
    deposit_minor: number;
    deposit_non_refundable?: boolean;
  };
  editable: boolean;
}) {
  if (!editable || booking.deposit_minor <= 0) {
    return null;
  }
  return (
    <p>
      {depositRefundLine(
        booking.cancel_cutoff_hours,
        booking.deposit_non_refundable === true
      )}
    </p>
  );
}
