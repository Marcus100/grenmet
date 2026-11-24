"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { BOOKING_POLICY_MAX, policyLength } from "@/lib/booking-policy-text";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { keepTyped, SettingsResult } from "./settings-ui";

/**
 * The booking policy: plain text shown before the customer confirms and in the
 * confirmation. Its own form and Save button; the API keeps every other field.
 */
export function BookingPolicyForm({
  orgSlug,
  profile,
}: {
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

  return (
    <form className="space-y-4" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="policy" />
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Booking policy</legend>
        <p className="text-muted-foreground text-base">
          Shown on your booking page before the customer confirms, and in their
          confirmation email. Write it as plain text, for example your late fee.
          Line breaks are kept.
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
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated || tooLong}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save booking policy"}
      </Button>
    </form>
  );
}
