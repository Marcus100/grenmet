"use client";

import type {
  BookingDepositCollection,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveServiceAction } from "@/app/studio/[orgSlug]/settings/actions";
import { moneyInput } from "@/lib/settings-view";
import { IDLE } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import {
  INPUT,
  keepTyped,
  SettingsCheck,
  SettingsField,
  SettingsResult,
} from "./settings-ui";

function depositHint(
  collection: BookingDepositCollection,
  depositsAvailable: boolean
): string {
  if (collection === "business") {
    return "Paid to you directly by the customer, outside Barrels: you confirm the booking once it arrives. Cannot exceed the price. 0 means no deposit.";
  }
  return depositsAvailable
    ? "Taken when the customer books. Cannot exceed the price. 0 means no deposit."
    : "This business does not have online payments, so a deposit is saved but not collected online; staff record it by hand.";
}

/** Adds a service, or edits `service` when given. Prices are typed in whole currency units. */
export function ServiceForm({
  addOnCategories = [],
  addOnsEnabled = false,
  currency,
  depositCollection = "online",
  depositsAvailable,
  orgSlug,
  service,
}: {
  /** Categories of the main services, to choose which one an add-on follows. */
  addOnCategories?: string[];
  /** The business has add-ons switched on (the form still saves the flag when off). */
  addOnsEnabled?: boolean;
  currency: string;
  /** Who collects deposits; `business` needs no payments entitlement. */
  depositCollection?: BookingDepositCollection;
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
  const [isAddOn, setIsAddOn] = useState(service?.is_add_on ?? false);
  // The API lets add-on only win; the form never lets both be on.
  const [alsoAddOn, setAlsoAddOn] = useState(
    !(service?.is_add_on ?? false) && (service?.also_add_on ?? false)
  );

  useEffect(() => {
    // An add form starts blank again once the service is saved.
    if (state.status === "success" && !service) {
      formRef.current?.reset();
      setIsAddOn(false);
      setAlsoAddOn(false);
    }
  }, [state, service]);

  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)} ref={formRef}>
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
          hint={depositHint(depositCollection, depositsAvailable)}
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
      <AddOnFields
        addOnsEnabled={addOnsEnabled}
        alsoAddOn={alsoAddOn}
        categories={addOnCategories}
        isAddOn={isAddOn}
        onAlsoChange={(value) => {
          setAlsoAddOn(value);
          if (value) {
            setIsAddOn(false);
          }
        }}
        onChange={(value) => {
          setIsAddOn(value);
          if (value) {
            setAlsoAddOn(false);
          }
        }}
        prefixId={prefix}
        selected={service?.add_on_categories ?? []}
      />
      <SettingsCheck
        defaultChecked={service?.active ?? true}
        label="Offered to customers (untick to stop new bookings)"
        name="active"
      />
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

/**
 * "This is an add-on" and which main-service categories it is offered with.
 * Categories show only for an add-on; none ticked means every main service.
 */
function AddOnFields({
  addOnsEnabled,
  alsoAddOn,
  categories,
  isAddOn,
  onAlsoChange,
  onChange,
  prefixId,
  selected,
}: {
  addOnsEnabled: boolean;
  alsoAddOn: boolean;
  categories: string[];
  isAddOn: boolean;
  onAlsoChange: (value: boolean) => void;
  onChange: (value: boolean) => void;
  prefixId: string;
  selected: string[];
}) {
  const offered = isAddOn || alsoAddOn;
  // A category the add-on already follows stays listed even if no main service uses it now.
  const choices = [...new Set([...categories, ...selected])];
  return (
    <fieldset className="border-border space-y-2 border-t pt-4">
      <legend className="pt-4 font-medium">Add-on</legend>
      <Label className="min-h-11 items-center gap-3">
        <input
          aria-describedby={`${prefixId}-add-on-hint`}
          checked={isAddOn}
          className="accent-primary size-5"
          name="isAddOn"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        This is an add-on
      </Label>
      <p
        className="text-muted-foreground text-sm"
        id={`${prefixId}-add-on-hint`}
      >
        {addOnsEnabled
          ? "An add-on is never booked alone. Customers tick it after choosing a main service, and its time and price are added to the booking. Its own deposit is not used."
          : "An add-on is never booked alone. Customers will not see it until you switch add-ons on under Services. Its own deposit is not used."}
      </p>
      <Label className="min-h-11 items-center gap-3">
        <input
          aria-checked={alsoAddOn}
          aria-describedby={`${prefixId}-also-hint`}
          checked={alsoAddOn}
          className="accent-primary size-5"
          name="alsoAddOn"
          onChange={(event) => onAlsoChange(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        Also offer as an add-on
      </Label>
      <p className="text-muted-foreground text-sm" id={`${prefixId}-also-hint`}>
        Customers can still book this service on its own, and can also tick it
        as an extra on another service. Turning this on turns off &quot;This is
        an add-on&quot;, because an add-on is never booked alone.
      </p>
      {offered ? (
        <fieldset className="space-y-1">
          <legend className="font-medium">
            Offer it with these categories
          </legend>
          {choices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Your main services have no categories yet, so this add-on is
              offered with every main service.
            </p>
          ) : (
            <>
              {choices.map((category) => (
                <Label className="min-h-11 items-center gap-3" key={category}>
                  <input
                    className="accent-primary size-5"
                    defaultChecked={selected.includes(category)}
                    name="addOnCategory"
                    type="checkbox"
                    value={category}
                  />
                  {category}
                </Label>
              ))}
              <p className="text-muted-foreground text-sm">
                Tick none to offer it with every main service.
              </p>
            </>
          )}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
