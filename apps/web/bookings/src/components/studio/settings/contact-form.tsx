"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { ContactOptions } from "./contact-options";
import { keepTyped, SettingsResult } from "./settings-ui";

/**
 * The contact section's own form: saves the four contact options and keeps
 * everything else in the profile as it is stored.
 */
export function ContactForm({
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
  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="contact" />
      <ContactOptions
        errors={state.status === "error" ? state.fields : undefined}
        profile={profile}
      />
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save contact options"}
      </Button>
    </form>
  );
}
