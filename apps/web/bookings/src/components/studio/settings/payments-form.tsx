"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { PaymentOption } from "./payment-option";
import { keepTyped, SettingsResult } from "./settings-ui";

/**
 * The payments section's own form: saves how an online booking pays and keeps
 * everything else in the profile as it is stored.
 */
export function PaymentsForm({
  cardPaymentsAvailable,
  orgSlug,
  profile,
}: {
  /** The platform takes card payments online (Stripe test mode). */
  cardPaymentsAvailable: boolean;
  orgSlug: string;
  profile: BookingProfilePublic;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    saveProfileAction.bind(null, orgSlug),
    IDLE
  );
  const hydrated = useHydrated();
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="payments" />
      <PaymentOption
        cardPaymentsAvailable={cardPaymentsAvailable}
        profile={profile}
      />
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save payment choice"}
      </Button>
    </form>
  );
}
