"use client";

import type { BookingServicePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useActionState, useEffect, useRef } from "react";
import { saveServiceAction } from "@/app/studio/[orgSlug]/settings/actions";
import { moneyInput } from "@/lib/settings-view";
import { IDLE } from "@/lib/studio-action-state";
import {
  INPUT,
  SettingsCheck,
  SettingsField,
  SettingsResult,
} from "./settings-ui";

/** Adds a service, or edits `service` when given. Prices are typed in whole currency units. */
export function ServiceForm({
  currency,
  depositsAvailable,
  orgSlug,
  service,
}: {
  currency: string;
  depositsAvailable: boolean;
  orgSlug: string;
  service?: BookingServicePublic;
}) {
  const [state, formAction, pending] = useActionState(
    saveServiceAction.bind(null, orgSlug),
    IDLE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitLabel = service ? "Save service" : "Add service";
  const prefix = `service-${service?.id ?? "new"}`;

  useEffect(() => {
    // An add form starts blank again once the service is saved.
    if (state.status === "done" && !service) {
      formRef.current?.reset();
    }
  }, [state, service]);

  return (
    <form action={formAction} className="space-y-5" ref={formRef}>
      <input name="serviceId" type="hidden" value={service?.id ?? ""} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsField id={`${prefix}-name`} label="Service name">
          {() => (
            <Input
              className={INPUT}
              defaultValue={service?.name ?? ""}
              id={`${prefix}-name`}
              maxLength={120}
              name="name"
              required
            />
          )}
        </SettingsField>
        <SettingsField id={`${prefix}-category`} label="Category (optional)">
          {() => (
            <Input
              className={INPUT}
              defaultValue={service?.category ?? ""}
              id={`${prefix}-category`}
              maxLength={80}
              name="category"
            />
          )}
        </SettingsField>
        <SettingsField id={`${prefix}-durationMin`} label="Duration (minutes)">
          {() => (
            <Input
              className={INPUT}
              defaultValue={service?.duration_min ?? 60}
              id={`${prefix}-durationMin`}
              inputMode="numeric"
              name="durationMin"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint="Held free around the appointment."
          id={`${prefix}-bufferBeforeMin`}
          label="Buffer before (minutes)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={service?.buffer_before_min ?? 0}
              id={`${prefix}-bufferBeforeMin`}
              inputMode="numeric"
              name="bufferBeforeMin"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          id={`${prefix}-bufferAfterMin`}
          label="Buffer after (minutes)"
        >
          {() => (
            <Input
              className={INPUT}
              defaultValue={service?.buffer_after_min ?? 0}
              id={`${prefix}-bufferAfterMin`}
              inputMode="numeric"
              name="bufferAfterMin"
              required
            />
          )}
        </SettingsField>
        <SettingsField id={`${prefix}-price`} label={`Price (${currency})`}>
          {() => (
            <Input
              className={INPUT}
              defaultValue={moneyInput(service?.price_minor ?? 0)}
              id={`${prefix}-price`}
              inputMode="decimal"
              name="price"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          hint={
            depositsAvailable
              ? "Taken when the customer books. Cannot exceed the price. 0 means no deposit."
              : "This business does not have online payments, so a deposit is saved but not collected online; staff record it by hand."
          }
          id={`${prefix}-deposit`}
          label={`Deposit (${currency})`}
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              defaultValue={moneyInput(service?.deposit_minor ?? 0)}
              id={`${prefix}-deposit`}
              inputMode="decimal"
              name="deposit"
              required
            />
          )}
        </SettingsField>
        <SettingsField
          id={`${prefix}-description`}
          label="Description (optional)"
        >
          {() => (
            <Textarea
              defaultValue={service?.description ?? ""}
              id={`${prefix}-description`}
              maxLength={2000}
              name="description"
              rows={3}
            />
          )}
        </SettingsField>
      </div>
      <SettingsCheck
        defaultChecked={service?.active ?? true}
        label="Offered to customers (untick to stop new bookings)"
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
