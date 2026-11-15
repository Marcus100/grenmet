"use client";

import { recallManagePath } from "@barrelsgd/bookings-web/lib/booking-payment";
import { useEffect, useState } from "react";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const LOST_PAID =
  "We are confirming your payment. Your booking confirmation arrives by email once it is received. Open the manage link you were given to see your booking.";
const LOST_UNPAID =
  "Your time stays held for a short while. Open the manage link you were given and choose Pay now to finish, or the time is released.";

/**
 * Back from the hosted checkout: go on to the booking's manage page, which
 * shows whether the payment arrived. Without a remembered page (another
 * browser, storage blocked) it says where to find the booking instead.
 */
export function CheckoutReturn({
  bookingId,
  paid,
}: {
  bookingId: string;
  paid: boolean;
}) {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const path = UUID.test(bookingId) ? recallManagePath(bookingId) : null;
    if (path) {
      window.location.replace(path);
      return;
    }
    setLost(true);
  }, [bookingId]);
  let message = "Taking you to your booking...";
  if (lost) {
    message = paid ? LOST_PAID : LOST_UNPAID;
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">
        {paid ? "Thank you for your payment" : "Payment not finished"}
      </h1>
      <p className="text-muted-foreground" role="status">
        {message}
      </p>
    </>
  );
}
