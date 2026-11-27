"use client";

import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import {
  paymentLine,
  rememberManagePath,
  safeCheckoutUrl,
} from "../lib/booking-payment";

export interface PaymentStatusProps {
  /**
   * Set when the business accepted a request that is paid after acceptance (its
   * name): the line then says so and asks for the payment.
   */
  acceptedBy?: string | undefined;
  bookingId: string;
  /**
   * Where this booking is managed (with its token), for the way back from
   * paying. Left out, the current page is used (the manage page itself).
   */
  managePath?: string | undefined;
  payment: BookingPaymentSummary;
}

/**
 * Paid or not paid, in words, with a "Pay now" link while an online payment is
 * due. Card payments run in Stripe test mode only.
 */
export function PaymentStatus({
  acceptedBy,
  bookingId,
  managePath,
  payment,
}: PaymentStatusProps) {
  const checkoutUrl = safeCheckoutUrl(payment);
  const due = payment.status === "due";
  return (
    <section
      aria-labelledby={`payment-${bookingId}`}
      className={`notice payment payment-${payment.status}`}
    >
      <h3 id={`payment-${bookingId}`}>Payment</h3>
      <p>
        {paymentLine(
          payment,
          acceptedBy === undefined ? undefined : { businessName: acceptedBy }
        )}
      </p>
      {due && checkoutUrl && (
        <p>
          <a
            className="btn btn-solid"
            href={checkoutUrl}
            onClick={() =>
              rememberManagePath(
                bookingId,
                managePath ?? window.location.pathname
              )
            }
          >
            Pay now
          </a>
        </p>
      )}
      {due && !checkoutUrl && <p>The business will tell you how to pay.</p>}
    </section>
  );
}
