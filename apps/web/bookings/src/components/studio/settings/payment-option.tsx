"use client";

import type {
  BookingPaymentMode,
  BookingProfilePublic,
} from "@barrelsgd/api-client";
import { Label } from "@barrelsgd/ui/components/ui/label";

const CHOICES: { label: string; value: BookingPaymentMode }[] = [
  {
    value: "deposit",
    label:
      "Deposit set on each service (no payment when a service has no deposit)",
  },
  { value: "full_price", label: "Full price, paid online by card" },
];

/**
 * What an online booking pays when it is made. Full price works only while
 * the platform takes card payments; until then the service deposit applies,
 * and the hint says so instead of hiding the choice.
 */
export function PaymentOption({
  cardPaymentsAvailable,
  profile,
}: {
  cardPaymentsAvailable: boolean;
  profile: BookingProfilePublic | null;
}) {
  const current = profile?.payment_at_booking ?? "deposit";
  return (
    <fieldset
      aria-describedby="profile-payment-hint"
      className="border-border space-y-1 border-t pt-4"
    >
      <legend className="pt-4 font-medium">Payment when booking</legend>
      {CHOICES.map((choice) => (
        <Label className="min-h-11 items-center gap-3" key={choice.value}>
          <input
            className="accent-primary size-5"
            defaultChecked={choice.value === current}
            name="paymentAtBooking"
            type="radio"
            value={choice.value}
          />
          {choice.label}
        </Label>
      ))}
      <p className="text-muted-foreground text-sm" id="profile-payment-hint">
        {cardPaymentsAvailable
          ? "Card payments are in test mode: no real money moves. The time is held while the customer pays and released if they do not pay in time."
          : "Online card payments are not switched on yet, so bookings use the service deposit for now."}
      </p>
    </fieldset>
  );
}
