"use client";

// The time-off section of one provider's card. Everyone who can read the
// settings sees the list (an empty list says so, it is never hidden); owners
// and admins add time off and remove rows. Removal asks first in an alert
// dialog. Dates are on the business clock. Each result is announced, and a
// refused add keeps what was typed and names the field at fault.

import type { BookingExceptionPublic } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  removeTimeOffAction,
  saveTimeOffAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { type ActionState, IDLE } from "@/lib/studio-action-state";
import {
  kindLabel,
  spanLabel,
  type TimeOffFieldErrors,
  type TimeOffState,
} from "@/lib/time-off";
import { useHydrated } from "@/lib/use-hydrated";
import { INPUT, keepTyped, SettingsResult } from "./settings-ui";

// The design spec's minimum touch target; the touch size alone is 48 px.
const TARGET = "min-h-11";
/** Matches the API's limit on a reason (`BookingExceptionCreate`). */
const REASON_MAX_CHARS = 200;

export interface TimeOffSectionProps {
  /** Owners and admins add and remove; members only read. */
  editable: boolean;
  exceptions: BookingExceptionPublic[];
  orgSlug: string;
  providerId: string;
  zone: string;
}

export function TimeOffSection({
  editable,
  exceptions,
  orgSlug,
  providerId,
  zone,
}: TimeOffSectionProps) {
  const [notice, setNotice] = useState<ActionState>(IDLE);
  const onRemoved = useCallback((state: ActionState) => setNotice(state), []);
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-4 border-t pt-4"
    >
      <h3 className="font-medium" id={headingId}>
        Time off
      </h3>
      <p className="text-muted-foreground text-sm">
        Dates are on the business clock ({zone}). Time off blocks bookings;
        extra hours open times outside the weekly hours.
      </p>
      {exceptions.length === 0 ? (
        <Empty className="border-border border">
          <EmptyHeader>
            <EmptyTitle>No time off planned</EmptyTitle>
            <EmptyDescription>
              {editable
                ? "Add a holiday, leave or closure below. Until then, customers can book every time in the weekly hours."
                : "An owner or admin can add time off here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {exceptions.map((item) => {
            const span = spanLabel(item, zone);
            return (
              <li
                className="border-border flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                key={item.id}
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {kindLabel(item.kind)}: {span}
                  </p>
                  {item.reason ? (
                    <p className="text-muted-foreground text-sm">
                      {item.reason}
                    </p>
                  ) : null}
                </div>
                {editable ? (
                  <RemoveTimeOff
                    exceptionId={item.id}
                    onRemoved={onRemoved}
                    orgSlug={orgSlug}
                    span={span}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <SettingsResult pending={false} state={notice} />
      {editable ? (
        <div className="border-border space-y-3 border-t pt-4">
          <h4 className="font-medium">Add time off</h4>
          <TimeOffForm orgSlug={orgSlug} providerId={providerId} zone={zone} />
        </div>
      ) : null}
    </section>
  );
}

/** The add form. A success clears it; a refusal keeps every value and marks the fields at fault. */
function TimeOffForm({
  orgSlug,
  providerId,
  zone,
}: {
  orgSlug: string;
  providerId: string;
  zone: string;
}) {
  const [state, formAction, pending] = useActionState<TimeOffState, FormData>(
    saveTimeOffAction.bind(null, orgSlug),
    IDLE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = `time-off-${providerId}`;
  const fields: TimeOffFieldErrors =
    state.status === "error" ? (state.fields ?? {}) : {};

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();
  return (
    <form className="space-y-5" onSubmit={keepTyped(formAction)} ref={formRef}>
      <input name="providerId" type="hidden" value={providerId} />
      <div className="grid gap-5 sm:grid-cols-2">
        <DateTimeField
          error={fields.startsAt}
          id={`${prefix}-starts`}
          label="Starts"
          name="startsAt"
          zone={zone}
        />
        <DateTimeField
          error={fields.endsAt}
          id={`${prefix}-ends`}
          label="Ends"
          name="endsAt"
          zone={zone}
        />
      </div>
      <div className="space-y-1">
        <Label className="font-medium" htmlFor={`${prefix}-reason`}>
          Reason (optional)
        </Label>
        <Input
          aria-describedby={
            fields.reason ? `${prefix}-reason-error` : undefined
          }
          aria-invalid={fields.reason ? true : undefined}
          className={INPUT}
          id={`${prefix}-reason`}
          maxLength={REASON_MAX_CHARS}
          name="reason"
          placeholder="For example: annual leave"
        />
        <FieldError id={`${prefix}-reason-error`} message={fields.reason} />
      </div>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Add time off"}
      </Button>
    </form>
  );
}

function DateTimeField({
  error,
  id,
  label,
  name,
  zone,
}: {
  error: string | undefined;
  id: string;
  label: string;
  name: string;
  zone: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <Label className="font-medium" htmlFor={id}>
        {label}
      </Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={INPUT}
        id={id}
        name={name}
        required
        type="datetime-local"
      />
      <p className="text-muted-foreground text-sm">Business clock ({zone}).</p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldError({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  if (!message) {
    return null;
  }
  return (
    <p className="text-destructive text-sm font-medium" id={id}>
      {message}
    </p>
  );
}

/** The row's trigger and its confirm step. A fresh form opens each time. */
function RemoveTimeOff({
  exceptionId,
  onRemoved,
  orgSlug,
  span,
}: {
  exceptionId: string;
  onRemoved: (state: ActionState) => void;
  orgSlug: string;
  span: string;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const removed = useCallback(
    (state: ActionState) => {
      setOpen(false);
      onRemoved(state);
    },
    [onRemoved]
  );

  function change(next: boolean) {
    if (next) {
      setOpened((count) => count + 1);
    }
    setOpen(next);
  }

  return (
    <AlertDialog onOpenChange={change} open={open}>
      <AlertDialogTrigger
        render={<Button className={TARGET} size="touch" variant="outline" />}
      >
        Remove
        <span className="sr-only"> {span}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <RemoveForm
          action={removeTimeOffAction.bind(null, orgSlug, exceptionId)}
          key={opened}
          onDone={removed}
          span={span}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveForm({
  action,
  onDone,
  span,
}: {
  action: (previous: TimeOffState, formData: FormData) => Promise<TimeOffState>;
  onDone: (state: ActionState) => void;
  span: string;
}) {
  const [state, formAction, pending] = useActionState<TimeOffState, FormData>(
    action,
    IDLE
  );

  useEffect(() => {
    if (state.status === "success") {
      onDone(state);
    }
  }, [state, onDone]);

  return (
    <form className="grid gap-4" onSubmit={keepValuesOnSubmit(formAction)}>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove this time off?</AlertDialogTitle>
        <AlertDialogDescription>
          {span}. Customers will be offered these times again if the weekly
          hours are open.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <SettingsResult pending={pending} state={state} />
      <AlertDialogFooter>
        <AlertDialogCancel className={TARGET} size="touch">
          Keep it
        </AlertDialogCancel>
        <Button
          className={TARGET}
          disabled={pending}
          size="touch"
          type="submit"
          variant="destructive"
        >
          {pending ? "Removing..." : "Remove time off"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
