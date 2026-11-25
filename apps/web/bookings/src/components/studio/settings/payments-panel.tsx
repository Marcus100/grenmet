"use client";

import type {
  BookingDepositCollection,
  BookingProfilePublic,
} from "@barrelsgd/api-client";
import { useState } from "react";
import type { ExampleService } from "@/lib/deposit-rule";
import { DepositRuleForm } from "./deposit-rule-form";
import { PaymentsForm } from "./payments-form";

/**
 * The payment choice and the deposit rule under it. The rule follows the saved
 * choice; it also hears the unsaved radio so it can say when the two differ.
 */
export function PaymentsPanel({
  cardPaymentsAvailable,
  currency,
  depositsAvailable,
  example,
  orgSlug,
  profile,
}: {
  cardPaymentsAvailable: boolean;
  currency: string;
  depositsAvailable: boolean;
  example: ExampleService | null;
  orgSlug: string;
  profile: BookingProfilePublic;
}) {
  const saved: BookingDepositCollection =
    profile.deposit_collection ?? "online";
  const [chosen, setChosen] = useState<BookingDepositCollection>(saved);
  return (
    <>
      <PaymentsForm
        cardPaymentsAvailable={cardPaymentsAvailable}
        onCollectionChange={setChosen}
        orgSlug={orgSlug}
        profile={profile}
      />
      <DepositRuleForm
        chosenCollection={chosen}
        collection={saved}
        currency={currency}
        depositsAvailable={depositsAvailable}
        example={example}
        orgSlug={orgSlug}
        profile={profile}
      />
    </>
  );
}
