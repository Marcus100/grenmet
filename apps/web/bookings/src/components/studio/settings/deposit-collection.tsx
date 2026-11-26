"use client";

import type { BookingDepositCollection } from "@barrelsgd/api-client";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { policyLength } from "@/lib/booking-policy-text";
import { DEPOSIT_INSTRUCTIONS_MAX } from "@/lib/deposit-instructions";

const CHOICES: { label: string; value: BookingDepositCollection }[] = [
  { value: "online", label: "Online, by card at booking" },
  {
    value: "business",
    label: "Paid to me directly (bank transfer, PayPal, cash)",
  },
];

/**
 * "How customers pay a deposit": Barrels takes it by card online, or the
 * business is paid directly. The instructions box exists only in the second
 * case, so a form that leaves it out keeps what is stored.
 */
export function DepositCollection({
  collection,
  onCollectionChange,
  onTextChange,
  text,
}: {
  collection: BookingDepositCollection;
  onCollectionChange: (value: BookingDepositCollection) => void;
  onTextChange: (value: string) => void;
  /** The instructions as typed; the form owns it so Save can wait for a valid one. */
  text: string;
}) {
  const count = policyLength(text);
  const tooLong = count > DEPOSIT_INSTRUCTIONS_MAX;
  const business = collection === "business";
  return (
    <fieldset
      aria-describedby="deposit-collection-explain"
      className="border-border space-y-1 border-t pt-4"
    >
      <legend className="pt-4 font-medium">How customers pay a deposit</legend>
      {CHOICES.map((choice) => (
        <Label className="min-h-11 items-center gap-3" key={choice.value}>
          <input
            checked={collection === choice.value}
            className="accent-primary size-5 shrink-0"
            name="depositCollection"
            onChange={() => onCollectionChange(choice.value)}
            type="radio"
            value={choice.value}
          />
          {choice.label}
        </Label>
      ))}
      <p
        className="text-muted-foreground pt-2 text-base"
        id="deposit-collection-explain"
      >
        {business
          ? "Barrels collects nothing. The customer sees the deposit amount and your instructions, and books without paying online. You confirm each booking after the money arrives."
          : "The customer pays the deposit by card when they book, and the time is held while they pay."}
      </p>
      {business ? (
        <div className="grid gap-1.5 pt-3">
          <Label
            className="flex-col items-start gap-1.5 font-medium"
            htmlFor="deposit-instructions"
          >
            Payment instructions
          </Label>
          <textarea
            aria-describedby={`deposit-instructions-hint deposit-instructions-count${tooLong ? " deposit-instructions-error" : ""}`}
            aria-invalid={tooLong || undefined}
            className="border-border min-h-28 w-full rounded-md border p-3 text-base"
            id="deposit-instructions"
            name="depositInstructions"
            onChange={(event) => onTextChange(event.target.value)}
            value={text}
          />
          <p
            className="text-muted-foreground text-sm"
            id="deposit-instructions-hint"
          >
            Customers see this on their booking and in their emails, as your own
            payment instructions. For example: &quot;Send the deposit to First
            Caribbean account 1234567, then reply to your confirmation
            email.&quot; It is shown only while &quot;Paid to me directly&quot;
            is on.
          </p>
          <p
            className="text-muted-foreground text-sm"
            id="deposit-instructions-count"
          >
            {count} of {DEPOSIT_INSTRUCTIONS_MAX} characters
          </p>
          {tooLong ? (
            <p
              className="text-destructive text-base font-medium"
              id="deposit-instructions-error"
              role="alert"
            >
              Shorten the instructions to {DEPOSIT_INSTRUCTIONS_MAX} characters.
            </p>
          ) : null}
          {!tooLong && text.trim() === "" ? (
            <p className="text-base">
              Add instructions so customers know how to pay you. Without them
              they see only the amount.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
