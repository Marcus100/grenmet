import type { BookingStatus } from "@barrelsgd/api-client";

/** Plain words for every status the API can return (ADR-0058, slice 1). */
const LABELS: Record<BookingStatus, string> = {
  pending_payment: "Waiting for payment",
  pending: "Waiting to be confirmed",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  no_show: "Marked as no-show",
  completed: "Completed",
};

/** The label for a status; a value this app does not know is shown as sent. */
export function bookingStatusLabel(status: string): string {
  return Object.hasOwn(LABELS, status)
    ? LABELS[status as BookingStatus]
    : status;
}
