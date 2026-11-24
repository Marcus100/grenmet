"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { keepTyped, SettingsResult } from "./settings-ui";

/** The one switch that offers add-ons on the booking page. Off by default. */
export function AddOnsForm({
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
  return (
    <form className="space-y-3" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="addons" />
      <fieldset className="border-border space-y-2 border-t pt-4">
        <legend className="pt-4 font-medium">Add-ons</legend>
        <Label className="min-h-11 items-center gap-3">
          <input
            className="accent-primary size-5 shrink-0"
            defaultChecked={profile.add_ons_enabled ?? false}
            name="addOnsEnabled"
            type="checkbox"
          />
          Offer add-ons on my booking page
        </Label>
        <p className="text-muted-foreground text-base">
          When this is on, customers can tick extras such as a treatment add-on
          after they choose a main service. Each add-on adds its time and price
          to the booking. Mark a service as an add-on in its own form below.
          When this is off, add-ons are hidden and cannot be booked.
        </p>
      </fieldset>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save add-ons setting"}
      </Button>
    </form>
  );
}
