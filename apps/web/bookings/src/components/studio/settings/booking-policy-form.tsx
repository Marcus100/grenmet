"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { currencyPrefix } from "@barrelsgd/bookings-web/lib/booking-format";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { BOOKING_POLICY_MAX, policyLength } from "@/lib/booking-policy-text";
import {
  graceMinutes,
  LATE_GRACE_MAX,
  lateFeeMinor,
  lateFeeSentence,
} from "@/lib/late-fee";
import { moneyInput } from "@/lib/settings-view";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { INPUT, keepTyped, SettingsField, SettingsResult } from "./settings-ui";

function previewLine(preview: string | null, problem: boolean): string {
  if (preview !== null) {
    return `Customers will see: ${preview}`;
  }
  return problem
    ? "Fix the late fee to see what customers will read."
    : "Customers see no late fee.";
}

/**
 * The booking policy: plain text shown before the customer confirms and in the
 * confirmation. Its own form and Save button; the API keeps every other field.
 */
export function BookingPolicyForm({
  currency,
  orgSlug,
  profile,
}: {
  currency: string;
  orgSlug: string;
  profile: BookingProfilePublic;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    saveProfileAction.bind(null, orgSlug),
    IDLE
  );
  const hydrated = useHydrated();
  const [text, setText] = useState(profile.booking_policy ?? "");
  const count = policyLength(text);
  const tooLong = count > BOOKING_POLICY_MAX;
  const [feeText, setFeeText] = useState(
    profile.late_fee_minor ? moneyInput(profile.late_fee_minor) : ""
  );
  const [graceText, setGraceText] = useState(
    String(profile.late_grace_min ?? 0)
  );
  const fee = lateFeeMinor(feeText);
  const grace = graceMinutes(graceText);
  const preview =
    fee.ok && grace.ok
      ? lateFeeSentence(fee.value, grace.value, currency)
      : null;
  const lateProblem = !(fee.ok && grace.ok);

  return (
    <form className="space-y-4" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="policy" />
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Booking policy</legend>
        <p className="text-muted-foreground text-base">
          Customers open this by tapping &quot;Full policy&quot; next to the
          Book button, and it is in their confirmation email. Plain text only,
          for example your cancellation terms. Line breaks are kept. Leave it
          empty to show no &quot;Full policy&quot; link.
        </p>
        <div className="grid gap-1.5">
          <Label
            className="flex-col items-start gap-1.5"
            htmlFor="booking-policy"
          >
            Policy text
          </Label>
          <textarea
            aria-describedby="booking-policy-count"
            aria-invalid={tooLong || undefined}
            className="border-border min-h-32 w-full rounded-md border p-3 text-base"
            id="booking-policy"
            name="bookingPolicy"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <p
            className="text-muted-foreground text-sm"
            id="booking-policy-count"
          >
            {count} of {BOOKING_POLICY_MAX} characters
          </p>
          {tooLong ? (
            <p className="text-destructive text-base font-medium" role="alert">
              Shorten the policy to {BOOKING_POLICY_MAX} characters.
            </p>
          ) : null}
        </div>
      </fieldset>
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Late fee</legend>
        <p className="text-muted-foreground text-base">
          A fee for arriving late, paid at the appointment. Customers see it
          before they book. Leave the amount blank for no late fee.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <SettingsField
            error={fee.ok ? undefined : fee.message}
            hint="Leave blank for no late fee."
            id="late-fee"
            label={`Late fee (${currencyPrefix(currency)})`}
          >
            {(describedBy) => (
              <Input
                aria-describedby={describedBy}
                aria-invalid={fee.ok ? undefined : true}
                autoComplete="off"
                className={INPUT}
                id="late-fee"
                inputMode="decimal"
                name="lateFee"
                onChange={(event) => setFeeText(event.target.value)}
                placeholder="No late fee"
                value={feeText}
              />
            )}
          </SettingsField>
          <SettingsField
            error={grace.ok ? undefined : grace.message}
            hint={`Minutes a customer can be late before the fee applies, 0 to ${LATE_GRACE_MAX}.`}
            id="late-grace"
            label="Grace period (minutes)"
          >
            {(describedBy) => (
              <Input
                aria-describedby={describedBy}
                aria-invalid={grace.ok ? undefined : true}
                autoComplete="off"
                className={INPUT}
                id="late-grace"
                inputMode="numeric"
                name="lateGrace"
                onChange={(event) => setGraceText(event.target.value)}
                placeholder="0"
                value={graceText}
              />
            )}
          </SettingsField>
        </div>
        <p
          className="text-base"
          data-testid="late-fee-preview"
          id="late-fee-preview"
        >
          {previewLine(preview, lateProblem)}
        </p>
      </fieldset>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated || tooLong || lateProblem}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save booking policy"}
      </Button>
    </form>
  );
}
