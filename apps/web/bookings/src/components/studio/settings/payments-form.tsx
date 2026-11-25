"use client";

import type {
  BookingDepositCollection,
  BookingProfilePublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { policyLength } from "@/lib/booking-policy-text";
import { DEPOSIT_INSTRUCTIONS_MAX } from "@/lib/deposit-instructions";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { DepositCollection } from "./deposit-collection";
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
  const [collection, setCollection] = useState<BookingDepositCollection>(
    profile.deposit_collection ?? "online"
  );
  const [instructions, setInstructions] = useState(
    profile.deposit_instructions ?? ""
  );
  const tooLong =
    collection === "business" &&
    policyLength(instructions) > DEPOSIT_INSTRUCTIONS_MAX;
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="payments" />
      <DepositCollection
        collection={collection}
        onCollectionChange={setCollection}
        onTextChange={setInstructions}
        text={instructions}
      />
      {collection === "online" ? (
        <PaymentOption
          cardPaymentsAvailable={cardPaymentsAvailable}
          profile={profile}
        />
      ) : null}
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated || tooLong}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save payment choice"}
      </Button>
    </form>
  );
}
