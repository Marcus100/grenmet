"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { formatMoney } from "@barrelsgd/bookings-web/lib/booking-format";
import { depositRefundLine } from "@barrelsgd/bookings-web/lib/booking-policy";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import {
  type DepositRuleFields,
  depositPreviewMinor,
  depositRuleFields,
} from "@/lib/deposit-rule";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { keepTyped, SettingsResult } from "./settings-ui";

/** The service the preview is worked out for: the first priced, active one. */
export interface ExampleService {
  name: string;
  priceMinor: number;
}

/** The preview sentence for the example service under the rule. */
export function previewSentence(
  example: ExampleService,
  rule: DepositRuleFields,
  currency: string,
  cutoffHours: number | undefined
): string {
  const deposit = depositPreviewMinor(rule, example.priceMinor);
  const price = formatMoney(example.priceMinor, currency);
  if (deposit <= 0) {
    return `${example.name} (${price}) is booked without a deposit.`;
  }
  if (deposit >= example.priceMinor) {
    return `${example.name} (${price}): the full price is paid online to hold the booking.`;
  }
  const remaining = formatMoney(example.priceMinor - deposit, currency);
  const refund =
    cutoffHours === undefined ? "" : ` ${depositRefundLine(cutoffHours)}`;
  return `${example.name} (${price}): a deposit of ${formatMoney(deposit, currency)} is paid online, and the remaining ${remaining} is paid at the salon.${refund}`;
}

/**
 * The business-wide deposit rule: a switch that is off by default, the
 * percentage or fixed amount, and a live preview for one service. Its own form
 * and Save button; the API keeps every other profile field as stored.
 */
export function DepositRuleForm({
  currency,
  depositsAvailable,
  example,
  orgSlug,
  profile,
}: {
  currency: string;
  /** The platform takes deposits online for this business (payments entitlement). */
  depositsAvailable: boolean;
  example: ExampleService | null;
  orgSlug: string;
  profile: BookingProfilePublic;
}) {
  // The cutoff is the business's own setting, never a fixed number of hours.
  const cutoffHours = profile.cancel_cutoff_hours;
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    saveProfileAction.bind(null, orgSlug),
    IDLE
  );
  const hydrated = useHydrated();
  const stored = profile.deposit_mode ?? "none";
  const [on, setOn] = useState(stored !== "none");
  const [mode, setMode] = useState<"percent" | "fixed">(
    stored === "fixed" ? "fixed" : "percent"
  );
  const [percentText, setPercentText] = useState(
    profile.deposit_percent == null ? "" : String(profile.deposit_percent)
  );
  const [fixedText, setFixedText] = useState(
    profile.deposit_fixed_minor == null
      ? ""
      : String(profile.deposit_fixed_minor / 100)
  );

  const parsed = depositRuleFields({ on, mode, percentText, fixedText });
  const rule: DepositRuleFields = parsed.ok
    ? parsed.value
    : {
        deposit_mode: "none",
        deposit_percent: null,
        deposit_fixed_minor: null,
      };

  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="deposit" />
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Deposit for each booking</legend>
        <p className="text-muted-foreground text-sm">
          A deposit is paid online when the customer books, and it counts toward
          the price. A service with its own deposit keeps that amount.
        </p>
        <Label className="min-h-11 items-center gap-3">
          <input
            aria-checked={on}
            checked={on}
            className="accent-primary size-5"
            name="depositRequired"
            onChange={(event) => setOn(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          Require a deposit
        </Label>
        {on ? (
          <div className="space-y-3">
            <div
              aria-label="Deposit type"
              className="space-y-1"
              role="radiogroup"
            >
              {[
                { value: "percent", label: "A percentage of the price" },
                { value: "fixed", label: "A fixed amount per booking" },
              ].map((choice) => (
                <Label
                  className="min-h-11 items-center gap-3"
                  key={choice.value}
                >
                  <input
                    checked={mode === choice.value}
                    className="accent-primary size-5"
                    name="depositMode"
                    onChange={() =>
                      setMode(choice.value as "percent" | "fixed")
                    }
                    type="radio"
                    value={choice.value}
                  />
                  {choice.label}
                </Label>
              ))}
            </div>
            {mode === "percent" ? (
              <Label className="space-y-1">
                <span>Deposit percentage (1 to 100)</span>
                <input
                  className="border-border min-h-11 w-full rounded-md border px-3"
                  inputMode="numeric"
                  name="depositPercent"
                  onChange={(event) => setPercentText(event.target.value)}
                  value={percentText}
                />
              </Label>
            ) : (
              <Label className="space-y-1">
                <span>Deposit amount ({currency})</span>
                <input
                  className="border-border min-h-11 w-full rounded-md border px-3"
                  inputMode="decimal"
                  name="depositFixed"
                  onChange={(event) => setFixedText(event.target.value)}
                  value={fixedText}
                />
              </Label>
            )}
            {example ? (
              <p className="text-sm" data-testid="deposit-preview">
                {previewSentence(example, rule, currency, cutoffHours)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Add a priced service to see an example.
              </p>
            )}
            {depositsAvailable ? null : (
              <p className="text-muted-foreground text-sm">
                Deposits are collected online only once this business has online
                payments switched on. Until then bookings are made without one.
              </p>
            )}
            {parsed.ok ? null : (
              <p className="text-destructive text-sm" role="alert">
                {parsed.message}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Off: bookings take a deposit only where a service sets one.
          </p>
        )}
      </fieldset>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save deposit rule"}
      </Button>
    </form>
  );
}
