"use client";

// The staff "New booking" form (phone or walk-in). Phone and desk share one
// layout: a single column that widens to two on large screens, 44 px targets,
// labels above fields. The result is announced (role="alert" for a refusal)
// and takes focus. The idempotency key is rotated after a refusal so a fixed
// retry is a new request; an unchanged retry after a network drop keeps it.

import type {
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import {
  formatDuration,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useActionState, useEffect, useRef, useState } from "react";
import { createBookingAction } from "@/app/studio/[orgSlug]/bookings/new/actions";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { IDLE } from "@/lib/studio-action-state";
import { rotatesKey } from "@/lib/studio-view";
import { useHydrated } from "@/lib/use-hydrated";

const SELECT = "w-full [&_select]:h-11";
const INPUT = "h-11";

export interface NewBookingFormProps {
  orgSlug: string;
  providers: BookingProviderPublic[];
  services: BookingServicePublic[];
  /** Today on the business's calendar (YYYY-MM-DD). */
  today: string;
  /** Shown beside the time so staff know whose clock they are typing. */
  zone: string;
}

export function NewBookingForm({
  orgSlug,
  providers,
  services,
  today,
  zone,
}: NewBookingFormProps) {
  const [state, formAction, pending] = useActionState(
    createBookingAction.bind(null, orgSlug),
    IDLE
  );
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  // Made on mount, not on the server, so Back (router cache) never restores
  // a used key. Empty until then; Save stays off until it exists.
  const [key, setKey] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (state.status === "error") {
      // A refusal of the content gets a fresh key so the fixed retry is a new
      // request. A timeout or server fault keeps the key: the first attempt
      // may have been saved, and the same key replays it instead of doubling.
      if (rotatesKey(state.kind)) {
        setKey(crypto.randomUUID());
      }
      errorRef.current?.focus();
    }
  }, [state]);

  const offered = providers.filter((provider) =>
    provider.service_ids.includes(serviceId)
  );
  const service = services.find((item) => item.id === serviceId);

  return (
    <form className="space-y-5" onSubmit={keepValuesOnSubmit(formAction)}>
      <input name="idempotencyKey" type="hidden" value={key} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Service" name="serviceId">
          {(id) => (
            <NativeSelect
              className={SELECT}
              id={id}
              name="serviceId"
              onChange={(event) => setServiceId(event.target.value)}
              required
              value={serviceId}
            >
              {services.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name} ({formatDuration(item.duration_min)},{" "}
                  {formatMoney(item.price_minor)})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field
          hint={
            offered.length === 0
              ? "No active provider offers this service. Add one in the studio settings first."
              : undefined
          }
          label="Provider"
          name="providerId"
        >
          {(id, describedBy) => (
            <NativeSelect
              aria-describedby={describedBy}
              className={SELECT}
              id={id}
              key={serviceId}
              name="providerId"
              required
            >
              {offered.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Date" name="date">
          {(id) => (
            <Input
              className={INPUT}
              defaultValue={today}
              id={id}
              name="date"
              required
              type="date"
            />
          )}
        </Field>
        <Field
          hint={`Time on the business's clock (${zone}). Staff entries ignore opening hours; the provider cannot be double-booked.`}
          label="Start time"
          name="time"
        >
          {(id, describedBy) => (
            <Input
              aria-describedby={describedBy}
              className={INPUT}
              id={id}
              name="time"
              required
              type="time"
            />
          )}
        </Field>
        <Field label="Customer name" name="customerName">
          {(id) => (
            <Input
              autoComplete="off"
              className={INPUT}
              id={id}
              maxLength={120}
              name="customerName"
              required
            />
          )}
        </Field>
        <Field label="Phone (optional)" name="customerPhone">
          {(id) => (
            <Input
              autoComplete="off"
              className={INPUT}
              id={id}
              inputMode="tel"
              maxLength={40}
              name="customerPhone"
              type="tel"
            />
          )}
        </Field>
        <Field label="Email (optional)" name="customerEmail">
          {(id) => (
            <Input
              autoComplete="off"
              className={INPUT}
              id={id}
              inputMode="email"
              maxLength={254}
              name="customerEmail"
              type="email"
            />
          )}
        </Field>
        <Field label="Notes (optional)" name="notes">
          {(id) => <Textarea id={id} maxLength={1000} name="notes" rows={3} />}
        </Field>
      </div>
      <Label className="min-h-11 items-center gap-3">
        <input
          className="size-5 accent-primary"
          name="sendConfirmation"
          type="checkbox"
        />
        Email the customer a confirmation with a link to manage it
      </Label>
      {service && service.deposit_minor > 0 ? (
        <p className="text-muted-foreground text-sm">
          Staff bookings are confirmed without taking the{" "}
          {formatMoney(service.deposit_minor)} deposit.
        </p>
      ) : null}
      {state.status === "error" ? (
        <div
          className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">{state.message}</p>
          <p className="text-muted-foreground">{state.nextStep}</p>
        </div>
      ) : null}
      <p className="sr-only" role="status">
        {pending ? "Saving the booking" : ""}
      </p>
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated || key === "" || offered.length === 0}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save booking"}
      </Button>
    </form>
  );
}

function Field({
  children,
  hint,
  label,
  name,
}: {
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
  hint?: string | undefined;
  label: string;
  name: string;
}) {
  const id = `new-booking-${name}`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1">
      <Label className="font-medium" htmlFor={id}>
        {label}
      </Label>
      {children(id, hint ? hintId : undefined)}
      {hint ? (
        <p className="text-muted-foreground text-sm" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
