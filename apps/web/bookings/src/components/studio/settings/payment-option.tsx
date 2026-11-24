"use client";

import type {
  BookingPaymentMode,
  BookingProfilePublic,
} from "@barrelsgd/api-client";
import { Label } from "@barrelsgd/ui/components/ui/label";

const CHOICES: { label: string; value: BookingPaymentMode }[] = [
  {
    value: "deposit",
    label: "Deposit: each service's own deposit, or the deposit rule below",
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
      aria-describedby="profile-payment-hint profile-payment-precedence"
      className="border-border space-y-1 border-t pt-4"
    >
      <legend className="pt-4 font-medium">Payment when booking</legend>
      {CHOICES.map((choice) => (
        <Label className="min-h-11 items-center gap-3" key={choice.value}>
          <input
            className="accent-primary size-5 shrink-0"
            defaultChecked={choice.value === current}
            name="paymentAtBooking"
            type="radio"
            value={choice.value}
          />
          {choice.label}
        </Label>
      ))}
      <p
        className="text-muted-foreground pt-2 text-base"
        id="profile-payment-precedence"
      >
        Full price applies only when online card payments can charge it. Then a
        service&apos;s own deposit and the deposit rule below are not used.
        Otherwise each service&apos;s own deposit applies, or the deposit rule
        below when a service has none. A booking with no online payment is paid
        at the salon.
      </p>
      <p className="text-muted-foreground text-base" id="profile-payment-hint">
        {cardPaymentsAvailable
          ? "Card payments are in test mode: no real money moves. The time is held while the customer pays and released if they do not pay in time."
          : "Online card payments are not switched on yet, so full price is not charged and bookings use the deposit for now."}
      </p>
    </fieldset>
  );
}
