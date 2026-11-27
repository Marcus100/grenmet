"use client";

import type {
  BookingDepositCollection,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveServiceAction } from "@/app/studio/[orgSlug]/settings/actions";
import { moneyInput } from "@/lib/settings-view";
import { IDLE } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import {
  INPUT,
  keepTyped,
  NobodyDoesNotice,
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
  nobodyDoes = false,
  orgSlug,
  service,
  serviceCategories = [],
}: {
  /** Categories of the main services, to choose which one an add-on follows. */
  addOnCategories?: string[];
  /** The business has add-ons switched on (the form still saves the flag when off). */
  addOnsEnabled?: boolean;
  currency: string;
  /** Who collects deposits; `business` needs no payments entitlement. */
  depositCollection?: BookingDepositCollection;
  depositsAvailable: boolean;
  /** This service is offered to customers but no active person is set to do it. */
  nobodyDoes?: boolean;
  orgSlug: string;
  service?: BookingServicePublic;
  /** Every category the business's services use, to choose a new-client lead time's categories. */
  serviceCategories?: string[];
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
  // A new-clients-only service is never an add-on, so the two are exclusive too.
  const [newClients, setNewClients] = useState(
    service?.new_clients_only ?? false
  );

  useEffect(() => {
    // An add form starts blank again once the service is saved.
    if (state.status === "success" && !service) {
      formRef.current?.reset();
      setIsAddOn(false);
      setAlsoAddOn(false);
      setNewClients(false);
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
      <NewClientsFields
        categories={serviceCategories}
        disabled={isAddOn || alsoAddOn}
        firstVisitCategories={service?.first_visit_categories ?? []}
        leadDays={service?.first_visit_lead_days ?? null}
        newClients={newClients}
        onChange={(value) => {
          setNewClients(value);
          if (value) {
            setIsAddOn(false);
            setAlsoAddOn(false);
          }
        }}
        prefixId={prefix}
      />
      <AddOnFields
        addOnsEnabled={addOnsEnabled}
        alsoAddOn={alsoAddOn}
        categories={addOnCategories}
        disabled={newClients}
        isAddOn={isAddOn}
        onAlsoChange={(value) => {
          setAlsoAddOn(value);
          if (value) {
            setIsAddOn(false);
            setNewClients(false);
          }
        }}
        onChange={(value) => {
          setIsAddOn(value);
          if (value) {
            setAlsoAddOn(false);
            setNewClients(false);
          }
        }}
        prefixId={prefix}
        selected={service?.add_on_categories ?? []}
      />
      {nobodyDoes ? <NobodyDoesNotice orgSlug={orgSlug} /> : null}
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
  disabled,
  isAddOn,
  onAlsoChange,
  onChange,
  prefixId,
  selected,
}: {
  addOnsEnabled: boolean;
  alsoAddOn: boolean;
  categories: string[];
  /** On while the service is for new clients only: an add-on cannot be that too. */
  disabled: boolean;
  isAddOn: boolean;
  onAlsoChange: (value: boolean) => void;
  onChange: (value: boolean) => void;
  prefixId: string;
  selected: string[];
}) {
  const offered = isAddOn || alsoAddOn;
  // A category the add-on already follows stays listed even if no main service uses it now.
  const choices = [...new Set([...categories, ...selected])];
  const blockedId = `${prefixId}-add-on-blocked`;
  return (
    <fieldset className="border-border space-y-2 border-t pt-4">
      <legend className="pt-4 font-medium">Add-on</legend>
      {disabled ? (
        <p className="text-muted-foreground text-sm" id={blockedId}>
          Turn off &ldquo;New clients only&rdquo; to offer this as an add-on. A
          service cannot be both.
        </p>
      ) : null}
      <Label
        className={cn("min-h-11 items-center gap-3", disabled && "opacity-60")}
      >
        <input
          aria-describedby={disabled ? blockedId : `${prefixId}-add-on-hint`}
          checked={isAddOn}
          className="accent-primary size-5"
          disabled={disabled}
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
      <Label
        className={cn("min-h-11 items-center gap-3", disabled && "opacity-60")}
      >
        <input
          aria-describedby={disabled ? blockedId : `${prefixId}-also-hint`}
          checked={alsoAddOn}
          className="accent-primary size-5"
          disabled={disabled}
          name="alsoAddOn"
          onChange={(event) => onAlsoChange(event.target.checked)}
          type="checkbox"
        />
        Also offer as an add-on
      </Label>
      <p className="text-muted-foreground text-sm" id={`${prefixId}-also-hint`}>
        {addOnsEnabled
          ? 'Customers can still book this service on its own, and can also tick it as an extra on another service. Turning this on turns off "This is an add-on", because an add-on is never booked alone.'
          : 'Customers can still book this service on its own. They will not see it as an extra until you switch add-ons on under Services. Turning this on turns off "This is an add-on", because an add-on is never booked alone.'}
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

/** The most days a new client can be asked to book ahead (the API's limit). */
const LEAD_DAYS_MAX = 60;

/**
 * "New clients only": every online booking of the service waits for the
 * business to confirm it. The lead time and its categories are shown to
 * customers, not enforced, and are sent only while the switch is on.
 */
function NewClientsFields({
  categories,
  disabled,
  firstVisitCategories,
  leadDays,
  newClients,
  onChange,
  prefixId,
}: {
  /** Every category the business's services use. */
  categories: string[];
  /** On while the service is an add-on: a new-clients-only service is never one. */
  disabled: boolean;
  firstVisitCategories: string[];
  leadDays: number | null;
  newClients: boolean;
  onChange: (value: boolean) => void;
  prefixId: string;
}) {
  const hintId = `${prefixId}-new-clients-hint`;
  // A category the lead time already names stays listed even if no service uses it now.
  const choices = [...new Set([...categories, ...firstVisitCategories])];
  return (
    <fieldset className="border-border space-y-2 border-t pt-4">
      <legend className="pt-4 font-medium">New clients</legend>
      {disabled ? (
        <p className="text-muted-foreground text-sm">
          Turn off &ldquo;This is an add-on&rdquo; and &ldquo;Also offer as an
          add-on&rdquo; to make this a new-clients service. An add-on is never
          booked alone.
        </p>
      ) : null}
      <Label
        className={cn("min-h-11 items-center gap-3", disabled && "opacity-60")}
      >
        <input
          aria-describedby={hintId}
          checked={newClients}
          className="accent-primary size-5"
          disabled={disabled}
          name="newClientsOnly"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        New clients only
      </Label>
      <p className="text-muted-foreground text-sm" id={hintId}>
        Every online booking of this service waits for you to confirm it. When
        someone who has booked with you before asks for it, you see that and can
        decline.
      </p>
      {newClients ? (
        <div className="grid gap-5 pt-2 lg:grid-cols-2">
          <SettingsField
            hint={`Optional, 0 to ${LEAD_DAYS_MAX}. Shown to customers, not enforced. Blank means no lead time.`}
            id={`${prefixId}-firstVisitLeadDays`}
            label="Book at least this many days before"
          >
            {(describedBy) => (
              <Input
                aria-describedby={describedBy}
                className={INPUT}
                defaultValue={leadDays ?? ""}
                id={`${prefixId}-firstVisitLeadDays`}
                max={LEAD_DAYS_MAX}
                min={0}
                name="firstVisitLeadDays"
                step={1}
                type="number"
              />
            )}
          </SettingsField>
          <fieldset className="space-y-1">
            <legend className="font-medium">
              Their first appointment is in
            </legend>
            {choices.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Give your services a category first (Category above). They will
                appear here to choose from.
              </p>
            ) : (
              <>
                {choices.map((category) => (
                  <Label className="min-h-11 items-center gap-3" key={category}>
                    <input
                      className="accent-primary size-5"
                      defaultChecked={firstVisitCategories.includes(category)}
                      name="firstVisitCategory"
                      type="checkbox"
                      value={category}
                    />
                    {category}
                  </Label>
                ))}
                <p className="text-muted-foreground text-sm">
                  Optional: tick the categories the lead time is about.
                </p>
              </>
            )}
          </fieldset>
        </div>
      ) : null}
    </fieldset>
  );
}
