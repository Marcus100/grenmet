"use client";

// The staff "New booking" form (phone or walk-in). Phone and desk share one
// layout: a single column that widens to two on large screens, 44 px targets,
// labels above fields. The service is found by search; once a service, a
// provider and a day are chosen, the open start times for them show as chips
// (the same availability the public page uses). Typing a time is still allowed.
// The result is announced (role="alert" for a refusal) and takes focus. The
// idempotency key is rotated after a refusal so a fixed retry is a new request;
// an unchanged retry after a network drop keeps it.

import type {
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import {
  formatDay,
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
import {
  createBookingAction,
  loadWalkInTimesAction,
  type WalkInTimesState,
} from "@/app/studio/[orgSlug]/bookings/new/actions";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { IDLE } from "@/lib/studio-action-state";
import { rotatesKey } from "@/lib/studio-view";
import { useHydrated } from "@/lib/use-hydrated";
import { matchesServiceSearch } from "@/lib/walk-in-times";

const SELECT = "w-full [&_select]:h-11";
const INPUT = "h-11";
const CHIP =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4 font-medium";
const CHIP_IDLE = "border-border bg-background text-foreground hover:bg-muted";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";

/** How long the open times wait after the last change before they are asked for. */
const TIMES_DEBOUNCE_MS = 300;

const TIMES_UNAVAILABLE =
  "Open times could not be loaded. Type a time below instead.";

export interface NewBookingFormProps {
  /** The business currency; services do not carry one. */
  currency: string;
  orgSlug: string;
  providers: BookingProviderPublic[];
  services: BookingServicePublic[];
  /** Today on the business's calendar (YYYY-MM-DD). */
  today: string;
  /** Shown beside the time so staff know whose clock they are typing. */
  zone: string;
}

/** The open-times panel's state: nothing asked yet, asking, or the answer. */
type TimesView = { status: "loading" } | WalkInTimesState;

export function NewBookingForm({
  currency,
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
  const [query, setQuery] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [providerId, setProviderId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [times, setTimes] = useState<TimesView | null>(null);
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
  // The provider the form will save: the one picked, else the first offered.
  const provider =
    offered.find((item) => item.id === providerId) ?? offered[0] ?? null;
  const chosenProviderId = provider?.id ?? "";
  const service = services.find((item) => item.id === serviceId);
  const shown = services.filter((item) => matchesServiceSearch(item, query));

  // Open times for the chosen service, provider and day. A request that is
  // overtaken by a newer choice is ignored when it answers.
  useEffect(() => {
    if (chosenProviderId === "" || serviceId === "") {
      return;
    }
    let current = true;
    setTimes({ status: "loading" });
    // A short pause lets a run of quick changes (typing a date, moving through
    // the services) settle into one request, not one per change.
    const timer = setTimeout(() => {
      loadWalkInTimesAction(orgSlug, {
        serviceId,
        providerId: chosenProviderId,
        date,
      })
        .then((result) => {
          if (current) {
            setTimes(result);
          }
        })
        .catch(() => {
          if (current) {
            setTimes({ status: "error", message: TIMES_UNAVAILABLE });
          }
        });
    }, TIMES_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [orgSlug, serviceId, chosenProviderId, date]);

  return (
    <form className="space-y-5" onSubmit={keepValuesOnSubmit(formAction)}>
      <input name="idempotencyKey" type="hidden" value={key} />
      <input name="serviceId" type="hidden" value={serviceId} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2 lg:col-span-2">
          <Label className="font-medium" htmlFor="new-booking-service-search">
            Search services
          </Label>
          <Input
            autoComplete="off"
            className={INPUT}
            id="new-booking-service-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a service or category"
            type="search"
            value={query}
          />
          <fieldset className="max-h-80 min-w-0 overflow-y-auto border-0 p-0">
            <legend className="mb-2 font-medium">
              Service
              {service ? (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (chosen: {service.name})
                </span>
              ) : null}
            </legend>
            {shown.length === 0 ? (
              <div className="border-border space-y-2 rounded-lg border border-dashed p-4">
                <p className="font-medium">No service matches “{query}”.</p>
                <Button
                  className="min-h-11"
                  onClick={() => setQuery("")}
                  type="button"
                  variant="outline"
                >
                  Clear search
                </Button>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {shown.map((item) => {
                  const on = item.id === serviceId;
                  return (
                    <li key={item.id}>
                      <button
                        aria-pressed={on}
                        className={`${CHIP} w-full justify-start text-left ${on ? CHIP_ON : CHIP_IDLE}`}
                        onClick={() => {
                          setServiceId(item.id);
                          setTime("");
                        }}
                        type="button"
                      >
                        <span>
                          {item.name}
                          <span
                            className={
                              on
                                ? "ms-2 font-normal"
                                : "text-muted-foreground ms-2 font-normal"
                            }
                          >
                            {formatDuration(item.duration_min)},{" "}
                            {formatMoney(item.price_minor, currency)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </div>
        <Field
          hint={
            offered.length === 0
              ? "No active provider offers this service. Add one under People in the studio first."
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
              name="providerId"
              onChange={(event) => {
                setProviderId(event.target.value);
                setTime("");
              }}
              required
              value={chosenProviderId}
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
              id={id}
              name="date"
              onChange={(event) => {
                setDate(event.target.value);
                setTime("");
              }}
              required
              type="date"
              value={date}
            />
          )}
        </Field>
      </div>

      <OpenTimes
        chosen={time}
        day={date}
        hasProvider={chosenProviderId !== ""}
        onChoose={setTime}
        times={times}
      />

      <Field
        hint={`Time on the business's clock (${zone}). Staff entries ignore opening hours; the provider cannot be double-booked.`}
        label="Start time"
        name="time"
      >
        {(id, describedBy) => (
          <Input
            aria-describedby={describedBy}
            className={`${INPUT} max-w-xs`}
            id={id}
            name="time"
            onChange={(event) => setTime(event.target.value)}
            required
            type="time"
            value={time}
          />
        )}
      </Field>

      <div className="grid gap-5 lg:grid-cols-2">
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
          className="accent-primary size-5"
          name="sendConfirmation"
          type="checkbox"
        />
        Email the customer a confirmation with a link to manage it
      </Label>
      {service && service.deposit_minor > 0 ? (
        <p className="text-muted-foreground text-sm">
          Staff bookings are confirmed without taking the{" "}
          {formatMoney(service.deposit_minor, currency)} deposit.
        </p>
      ) : null}
      {state.status === "error" ? (
        <div
          className="border-destructive/40 bg-destructive/10 space-y-1 rounded-lg border p-3"
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

/**
 * The open start times as chips. Each state has words: loading, the times,
 * no times that day, a closed booking page, or a failed read. Choosing a chip
 * fills the start time field below, which stays editable.
 */
function OpenTimes({
  chosen,
  day,
  hasProvider,
  onChoose,
  times,
}: {
  chosen: string;
  day: string;
  hasProvider: boolean;
  onChoose: (time: string) => void;
  times: TimesView | null;
}) {
  const heading = `Open times on ${formatDay(day, true)}`;
  if (!hasProvider) {
    return null;
  }
  let body: React.ReactNode;
  if (times === null || times.status === "loading") {
    body = (
      <p className="text-muted-foreground text-sm" role="status">
        Finding open times...
      </p>
    );
  } else if (times.status === "closed") {
    body = (
      <p className="text-muted-foreground text-sm">
        Online booking is closed, so open times are not listed here. Type the
        time below.
      </p>
    );
  } else if (times.status === "error") {
    body = <p className="text-muted-foreground text-sm">{times.message}</p>;
  } else if (times.times.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        No open times on this day for this provider. Type another time below, or
        choose another day.
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-wrap gap-2">
        {times.times.map((item) => {
          const on = item.time === chosen;
          return (
            <li key={item.time}>
              <button
                aria-pressed={on}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_IDLE}`}
                onClick={() => onChoose(item.time)}
                type="button"
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <section aria-labelledby="new-booking-open-times" className="space-y-2">
      <h2 className="font-medium" id="new-booking-open-times">
        {heading}
      </h2>
      {body}
    </section>
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
