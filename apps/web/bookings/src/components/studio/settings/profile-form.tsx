"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import { TIMEZONE_SUGGESTIONS } from "@/lib/settings-view";
import { IDLE } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import {
  INPUT,
  keepTyped,
  SettingsCheck,
  SettingsField,
  SettingsResult,
} from "./settings-ui";

export function ProfileForm({
  orgSlug,
  profile,
  suggestedName,
}: {
  orgSlug: string;
  profile: BookingProfilePublic | null;
  /** Prefills the business name for a first-time profile. */
  suggestedName: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction.bind(null, orgSlug),
    IDLE
  );
  const [zone, setZone] = useState(profile?.timezone ?? "America/Grenada");
  const [currency, setCurrency] = useState(profile?.currency ?? "XCD");
  const zoneChanged =
    profile?.timezone !== undefined && zone.trim() !== profile.timezone;
  const currencyChanged =
    profile?.currency !== undefined &&
    currency.trim().toUpperCase() !== profile.currency;
  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)}>
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsField id="profile-displayName" label="Business name">
          {() => (
            <Input
              className={INPUT}
              defaultValue={profile?.display_name ?? suggestedName}
              id="profile-displayName"
              maxLength={120}
              name="displayName"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="Customers book at this address on the bookings site. Lower-case letters, numbers and hyphens."
          id="profile-publicSlug"
          label="Booking address"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              autoCapitalize="none"
              className={INPUT}
              defaultValue={profile?.public_slug ?? ""}
              id="profile-publicSlug"
              maxLength={60}
              name="publicSlug"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint={
            zoneChanged
              ? "Changing this keeps saved hours as clock times in the new zone (9:00 stays 9:00, but on the new clock)."
              : "Opening hours and booking times are read on this clock."
          }
          id="profile-timezone"
          label="Timezone"
        >
          {(describedBy) => (
            <>
              <Input
                aria-describedby={describedBy}
                className={INPUT}
                defaultValue={profile?.timezone ?? "America/Grenada"}
                id="profile-timezone"
                list="profile-timezone-options"
                name="timezone"
                onChange={(event) => setZone(event.target.value)}
                required
              />
              <datalist id="profile-timezone-options">
                {TIMEZONE_SUGGESTIONS.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </>
          )}
        </SettingsField>
        <SettingsField
          hint={
            currencyChanged
              ? "Prices are not converted. Existing prices and deposits keep their numbers in the new currency."
              : "Prices and deposits use this currency."
          }
          id="profile-currency"
          label="Currency"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              autoCapitalize="characters"
              className={INPUT}
              defaultValue={profile?.currency ?? "XCD"}
              id="profile-currency"
              maxLength={3}
              name="currency"
              onChange={(event) => setCurrency(event.target.value)}
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="How far apart the offered start times are."
          id="profile-slotStepMin"
          label="Time slot length (minutes)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.slot_step_min ?? 30}
              id="profile-slotStepMin"
              inputMode="numeric"
              name="slotStepMin"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="The least notice a customer must give."
          id="profile-leadTimeMin"
          label="Minimum notice (minutes)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.lead_time_min ?? 120}
              id="profile-leadTimeMin"
              inputMode="numeric"
              name="leadTimeMin"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="How far ahead customers can book."
          id="profile-horizonDays"
          label="Booking window (days)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.horizon_days ?? 60}
              id="profile-horizonDays"
              inputMode="numeric"
              name="horizonDays"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="Customers cannot cancel online inside this many hours of the start. A cancellation by the business before the cutoff refunds a paid deposit by default; inside it, the deposit is kept."
          id="profile-cancelCutoffHours"
          label="Cancellation cutoff (hours before the start)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.cancel_cutoff_hours ?? 24}
              id="profile-cancelCutoffHours"
              inputMode="numeric"
              name="cancelCutoffHours"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="Where new-booking alerts go. Leave empty for none."
          id="profile-notifyEmail"
          label="Notification email (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.notify_email ?? ""}
              id="profile-notifyEmail"
              inputMode="email"
              maxLength={254}
              name="notifyEmail"
              type="email"
            />
          )}
        </SettingsField>
        <SettingsField
          hint="Only if the business has its own manage-a-booking page. Must start with https:// and contain {token}."
          id="profile-manageUrlTemplate"
          label="Manage-a-booking link (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={profile?.manage_url_template ?? ""}
              id="profile-manageUrlTemplate"
              maxLength={500}
              name="manageUrlTemplate"
            />
          )}
        </SettingsField>
      </div>
      <div className="space-y-1">
        <SettingsCheck
          defaultChecked={profile?.requires_confirmation ?? false}
          label="Confirm each request by hand before the customer is told it is booked"
          name="requiresConfirmation"
        />
        <SettingsCheck
          defaultChecked={profile?.enabled ?? false}
          label="Online booking is open (customers can book on the public page)"
          name="enabled"
        />
      </div>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
