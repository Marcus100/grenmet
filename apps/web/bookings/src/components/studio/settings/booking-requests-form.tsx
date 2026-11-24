"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";
import {
  checkExpiry,
  checkMaxOpen,
  EXPIRY_HOURS_DEFAULT,
  EXPIRY_HOURS_MAX,
  EXPIRY_HOURS_MIN,
  MAX_OPEN_DEFAULT,
  MAX_OPEN_MAX,
  MAX_OPEN_MIN,
} from "@/lib/request-hygiene";
import { IDLE, type ProfileState } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { INPUT, keepTyped, SettingsField, SettingsResult } from "./settings-ui";

/**
 * Booking requests: how long an unconfirmed request waits before it cancels
 * itself, and how many upcoming bookings one customer can hold online. Its own
 * form and Save button; the profile save keeps every other field.
 */
export function BookingRequestsForm({
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
  // Absent means the API default; null is a stored "only at the start time".
  const stored = profile.pending_expiry_hours;
  const [mode, setMode] = useState(stored === null ? "start" : "hours");
  const [hours, setHours] = useState(String(stored ?? EXPIRY_HOURS_DEFAULT));
  const [limit, setLimit] = useState(
    String(profile.max_open_per_customer ?? MAX_OPEN_DEFAULT)
  );
  const hoursCheck = checkExpiry(mode, hours);
  const limitCheck = checkMaxOpen(limit);
  const hoursError =
    hoursCheck.ok || !hydrated ? undefined : hoursCheck.message;
  const limitError =
    limitCheck.ok || !hydrated ? undefined : limitCheck.message;

  return (
    <form className="space-y-4" onSubmit={keepTyped(formAction)}>
      <input name="section" type="hidden" value="requests" />
      <fieldset className="border-border space-y-3 border-t pt-4">
        <legend className="pt-4 font-medium">Booking requests</legend>
        <div
          aria-describedby={hoursError ? "requests-expiry-error" : undefined}
          aria-label="Unconfirmed requests expire after"
          className="space-y-1"
          role="radiogroup"
        >
          <p className="font-medium">Unconfirmed requests expire after</p>
          <Label className="min-h-11 items-center gap-3">
            <input
              checked={mode === "hours"}
              className="accent-primary size-5 shrink-0"
              name="expiryMode"
              onChange={() => setMode("hours")}
              type="radio"
              value="hours"
            />
            A number of hours
          </Label>
          <div className="flex items-center gap-2 pl-8">
            <Input
              aria-invalid={hoursError ? true : undefined}
              aria-label="Hours until an unconfirmed request expires"
              className={`${INPUT} w-28`}
              disabled={mode !== "hours"}
              id="requests-expiry-hours"
              inputMode="numeric"
              max={EXPIRY_HOURS_MAX}
              min={EXPIRY_HOURS_MIN}
              name="pendingExpiryHours"
              onChange={(event) => setHours(event.target.value)}
              type="number"
              value={hours}
            />
            <span>hours</span>
          </div>
          <Label className="min-h-11 items-center gap-3">
            <input
              checked={mode === "start"}
              className="accent-primary size-5 shrink-0"
              name="expiryMode"
              onChange={() => setMode("start")}
              type="radio"
              value="start"
            />
            Only at the start time
          </Label>
          {hoursError ? (
            <p
              className="text-destructive text-sm font-medium"
              id="requests-expiry-error"
              role="alert"
            >
              {hoursError}
            </p>
          ) : null}
        </div>
        <SettingsField
          error={limitError}
          id="requests-max-open"
          label="Most upcoming bookings one customer can hold online"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              aria-invalid={limitError ? true : undefined}
              className={`${INPUT} w-28`}
              id="requests-max-open"
              inputMode="numeric"
              max={MAX_OPEN_MAX}
              min={MAX_OPEN_MIN}
              name="maxOpenPerCustomer"
              onChange={(event) => setLimit(event.target.value)}
              type="number"
              value={limit}
            />
          )}
        </SettingsField>
        <p className="text-muted-foreground text-base">
          If you don&apos;t confirm a request in time, it cancels itself and the
          customer gets an email saying so.
        </p>
        <p className="text-muted-foreground text-base">
          Customers who reach the limit are asked to contact you to book more.
        </p>
      </fieldset>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated || !hoursCheck.ok || !limitCheck.ok}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save booking requests"}
      </Button>
    </form>
  );
}
