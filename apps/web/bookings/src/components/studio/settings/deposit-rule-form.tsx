"use client";

import type {
  BookingDepositCollection,
  BookingProfilePublic,
} from "@barrelsgd/api-client";
import {
  currencyPrefix,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import { depositRefundLine } from "@barrelsgd/bookings-web/lib/booking-policy";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import {
  type DepositRuleFields,
  type DepositRuleResult,
  depositPreviewMinor,
  depositRuleFields,
  type ExampleService,
  minimumPriceFields,
} from "@/lib/deposit-rule";
import { moneyInput } from "@/lib/settings-view";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { keepTyped, SettingsResult } from "./settings-ui";

/**
 * The preview for a valid rule: one example service, or a prompt to add one. It
 * sits in its own box at body size so it reads as an example, not a footnote.
 */
function Preview({
  collection,
  cutoffHours,
  currency,
  depositsAvailable,
  example,
  nonRefundable,
  rule,
}: {
  collection: BookingDepositCollection;
  cutoffHours: number | undefined;
  currency: string;
  depositsAvailable: boolean;
  example: ExampleService | null;
  nonRefundable: boolean;
  rule: DepositRuleFields;
}) {
  if (example === null) {
    return (
      <p className="text-muted-foreground text-base">
        Add a priced service to see an example.
      </p>
    );
  }
  return (
    <div className="border-border bg-muted/40 space-y-1 rounded-md border p-3">
      <p className="text-caption text-muted-foreground font-medium">
        Example for one booking
      </p>
      <p className="text-base" data-testid="deposit-preview">
        {previewSentence(
          example,
          rule,
          currency,
          cutoffHours,
          depositsAvailable,
          nonRefundable,
          collection
        )}
      </p>
    </div>
  );
}

/**
 * The preview sentence for the example service under the rule. Without a
 * payment route (`depositsAvailable` false) nothing is paid online, so the
 * sentence says the booking is paid at the salon, whatever the rule says.
 */
export function previewSentence(
  example: ExampleService,
  rule: DepositRuleFields,
  currency: string,
  cutoffHours: number | undefined,
  depositsAvailable = true,
  nonRefundable = false,
  collection: BookingDepositCollection = "online"
): string {
  const price = formatMoney(example.priceMinor, currency);
  // Paid to the business directly: no online payment and no entitlement needed.
  const business = collection === "business";
  const where = business ? "to you directly" : "online";
  if (!(depositsAvailable || business)) {
    return `${example.name} (${price}) is paid at the salon: online deposits need this business to have online payments switched on.`;
  }
  const refund =
    // Barrels holds no money in "paid to me" mode, so it promises no refund.
    cutoffHours === undefined || business
      ? ""
      : ` ${depositRefundLine(cutoffHours, nonRefundable)}`;
  if (example.ownDepositMinor > 0) {
    // A service's own deposit wins over the business rule, so the rule is not shown.
    const own = formatMoney(example.ownDepositMinor, currency);
    return `${example.name} (${price}) has its own deposit of ${own}, which applies instead of this rule.${refund}`;
  }
  const deposit = depositPreviewMinor(rule, example.priceMinor);
  if (deposit <= 0) {
    const belowMinimum =
      rule.deposit_min_price_minor != null &&
      example.priceMinor < rule.deposit_min_price_minor;
    return belowMinimum
      ? `${example.name} (${price}) is booked without a deposit: it is below the lowest price for a deposit.`
      : `${example.name} (${price}) is booked without a deposit.`;
  }
  if (deposit >= example.priceMinor) {
    return `${example.name} (${price}): the full price is paid ${where} to hold the booking.`;
  }
  const remaining = formatMoney(example.priceMinor - deposit, currency);
  return `${example.name} (${price}): a deposit of ${formatMoney(deposit, currency)} is paid ${where}, and the remaining ${remaining} is paid at the salon.${refund}`;
}

/**
 * A percentage or amount typed into the rule. The label sits above the input
 * (never beside it, which squeezed the input at 375 px), the hint is linked, and
 * an invalid value marks the input and points at the error.
 */
function AmountField({
  errorId,
  hint,
  id,
  inputMode,
  invalid,
  label,
  name,
  onChange,
  placeholder,
  value,
}: {
  errorId: string;
  hint: string;
  id: string;
  inputMode: "decimal" | "numeric";
  invalid: boolean;
  label: string;
  name: string;
  onChange: (text: string) => void;
  placeholder: string;
  value: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-1.5">
      <Label className="flex-col items-start gap-1.5" htmlFor={id}>
        {label}
      </Label>
      <input
        aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="border-border min-h-11 w-full rounded-md border px-3 text-base"
        id={id}
        inputMode={inputMode}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <p className="text-muted-foreground text-sm" id={hintId}>
        {hint}
      </p>
    </div>
  );
}

/** The first thing wrong with the rule as typed, or null when it can be saved. */
function ruleProblem(
  parsed: DepositRuleResult,
  minimum: { ok: true; value: number | null } | { ok: false; message: string },
  on: boolean
): string | null {
  if (!parsed.ok) {
    return parsed.message;
  }
  if (on && !minimum.ok) {
    return minimum.message;
  }
  return null;
}

/**
 * The business-wide deposit rule: a switch that is off by default, the
 * percentage or fixed amount, and a live preview for one service. Its own form
 * and Save button; the API keeps every other profile field as stored.
 */
export function DepositRuleForm({
  chosenCollection,
  collection = "online",
  currency,
  depositsAvailable,
  example,
  orgSlug,
  profile,
}: {
  /** The payment choice as it is on the page now, saved or not. */
  chosenCollection?: BookingDepositCollection;
  /** Who collects the deposit (saved in the payment choice above). */
  collection?: BookingDepositCollection;
  currency: string;
  /** The platform takes deposits online for this business (payments entitlement). */
  depositsAvailable: boolean;
  example: ExampleService | null;
  orgSlug: string;
  profile: BookingProfilePublic;
}) {
  // The cutoff is the business's own setting, never a fixed number of hours.
  const cutoffHours = profile.cancel_cutoff_hours;
  const business = collection === "business";
  // Paid to the business by hand needs no payments entitlement.
  const usable = depositsAvailable || business;
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
      : moneyInput(profile.deposit_fixed_minor)
  );
  const [minText, setMinText] = useState(
    profile.deposit_min_price_minor == null
      ? ""
      : moneyInput(profile.deposit_min_price_minor)
  );
  const [nonRefundable, setNonRefundable] = useState(
    profile.deposit_non_refundable === true
  );

  const parsed = depositRuleFields({ on, mode, percentText, fixedText });
  const minimum = minimumPriceFields(minText);
  const errorId = "deposit-rule-error";
  const problem = ruleProblem(parsed, minimum, on);
  const rule: DepositRuleFields =
    parsed.ok && minimum.ok
      ? { ...parsed.value, deposit_min_price_minor: minimum.value }
      : {
          deposit_mode: "none",
          deposit_percent: null,
          deposit_fixed_minor: null,
          deposit_min_price_minor: null,
        };

  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="deposit" />
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Deposit for each booking</legend>
        <p className="text-muted-foreground text-base">
          {business
            ? "A deposit is paid to you directly: the customer sees the amount and your payment instructions when they book. It counts toward the price, and the customer pays the rest at the salon."
            : "A deposit is paid online when the customer books. It counts toward the price, and the customer pays the rest at the salon."}{" "}
          If a service has its own deposit, that amount is used instead of this
          rule. To change a service&apos;s own deposit, edit that service under
          Services.
        </p>
        {chosenCollection !== undefined && chosenCollection !== collection ? (
          <p
            className="border-border bg-muted rounded-md border p-3 text-base font-medium"
            role="status"
          >
            Save the payment choice above to update this section. It still
            follows the saved choice.
          </p>
        ) : null}
        <Label className="min-h-11 items-center gap-3">
          <input
            aria-checked={on}
            checked={on}
            className="accent-primary size-5 shrink-0"
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
                    className="accent-primary size-5 shrink-0"
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
              <AmountField
                errorId={errorId}
                hint="A whole number from 1 to 100, for example 25."
                id="deposit-percent"
                inputMode="numeric"
                invalid={!parsed.ok}
                label="Deposit percentage (1 to 100)"
                name="depositPercent"
                onChange={setPercentText}
                placeholder="25"
                value={percentText}
              />
            ) : (
              <AmountField
                errorId={errorId}
                hint={`The amount in ${currencyPrefix(currency)}, for example 50 or 50.50.`}
                id="deposit-fixed"
                inputMode="decimal"
                invalid={!parsed.ok}
                label={`Deposit amount (${currencyPrefix(currency)})`}
                name="depositFixed"
                onChange={setFixedText}
                placeholder="50.00"
                value={fixedText}
              />
            )}
            <AmountField
              errorId={errorId}
              hint="A service priced below this takes no deposit from this rule. Leave blank for no minimum. A service's own deposit still applies."
              id="deposit-min-price"
              inputMode="decimal"
              invalid={!minimum.ok}
              label={`Lowest service price that takes a deposit (${currencyPrefix(currency)})`}
              name="depositMinPrice"
              onChange={setMinText}
              placeholder="Optional"
              value={minText}
            />
            {problem === null ? (
              <Preview
                collection={collection}
                currency={currency}
                cutoffHours={cutoffHours}
                depositsAvailable={usable}
                example={example}
                nonRefundable={nonRefundable}
                rule={rule}
              />
            ) : null}
            {usable ? null : (
              <p className="text-muted-foreground text-base">
                Deposits are collected online only once this business has online
                payments switched on. Until then a booking is not paid online:
                the customer pays at the salon.
              </p>
            )}
            {problem === null ? null : (
              <p
                className="text-destructive text-base font-medium"
                id={errorId}
                role="alert"
              >
                {problem}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Off: bookings take a deposit only where a service sets one.
          </p>
        )}
        <Label className="min-h-11 items-center gap-3">
          <input
            aria-checked={nonRefundable}
            checked={nonRefundable}
            className="accent-primary size-5 shrink-0"
            name="depositNonRefundable"
            onChange={(event) => setNonRefundable(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          Non-refundable deposit
        </Label>
        <p className="text-muted-foreground text-base">
          {business
            ? "On: your booking page and emails tell customers the deposit is not refunded once you have confirmed the booking. Barrels never holds this money, so any refund is your own decision and you pay it back yourself."
            : "On: once you have confirmed a booking, the deposit is kept if the customer cancels, unless you choose to refund it on that booking. A request you have not confirmed yet is refunded if it is cancelled. Off: the customer gets the deposit back when they cancel before the cancellation cutoff. Either way, a customer can move a booking until the cutoff and the deposit moves with it, and a booking you decline is always refunded."}
        </p>
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
