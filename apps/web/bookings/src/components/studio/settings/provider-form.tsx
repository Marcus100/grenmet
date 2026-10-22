"use client";

import type {
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useActionState, useEffect, useRef } from "react";
import { saveProviderAction } from "@/app/studio/[orgSlug]/settings/actions";
import { IDLE } from "@/lib/studio-action-state";
import {
  INPUT,
  SettingsCheck,
  SettingsField,
  SettingsResult,
} from "./settings-ui";

/** Adds a provider, or edits `provider` when given, with the services they perform. */
export function ProviderForm({
  orgSlug,
  provider,
  services,
}: {
  orgSlug: string;
  provider?: BookingProviderPublic;
  services: BookingServicePublic[];
}) {
  const [state, formAction, pending] = useActionState(
    saveProviderAction.bind(null, orgSlug),
    IDLE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitLabel = provider ? "Save provider" : "Add provider";
  const prefix = `provider-${provider?.id ?? "new"}`;

  useEffect(() => {
    if (state.status === "done" && !provider) {
      formRef.current?.reset();
    }
  }, [state, provider]);

  return (
    <form action={formAction} className="space-y-5" ref={formRef}>
      <input name="providerId" type="hidden" value={provider?.id ?? ""} />
      <SettingsField id={`${prefix}-name`} label="Name">
        {() => (
          <Input
            className={INPUT}
            defaultValue={provider?.name ?? ""}
            id={`${prefix}-name`}
            maxLength={120}
            name="name"
            required
          />
        )}
      </SettingsField>
      <fieldset className="space-y-1">
        <legend className="font-medium">Services they perform</legend>
        {services.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add a service first, then choose it here.
          </p>
        ) : (
          services.map((item) => (
            <Label className="min-h-11 items-center gap-3" key={item.id}>
              <input
                className="size-5 accent-primary"
                defaultChecked={provider?.service_ids.includes(item.id)}
                name="serviceIds"
                type="checkbox"
                value={item.id}
              />
              {item.name}
              {item.active ? "" : " (not offered)"}
            </Label>
          ))
        )}
      </fieldset>
      <SettingsCheck
        defaultChecked={provider?.active ?? true}
        label="Takes bookings (untick when they are away for good)"
        name="active"
      />
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
