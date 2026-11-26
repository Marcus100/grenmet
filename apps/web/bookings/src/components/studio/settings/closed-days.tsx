"use client";

// Settings > Closed days: whole-business closures (every provider shut on the
// same local days, such as a holiday). Everyone who can read the settings sees
// the list; an empty list says so and is never hidden. Owners and admins add
// and reopen. Reopening asks first in an alert dialog. A save that touches
// existing bookings lists them, with links, and says they are not cancelled.

import type { BookingClosurePublic } from "@barrelsgd/api-client";
import { formatDateTime } from "@barrelsgd/bookings-web/lib/booking-format";
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
import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import {
  reopenClosureAction,
  saveClosureAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import {
  CLOSURE_REASON_MAX,
  type ClosureAffectedBooking,
  type ClosureFieldErrors,
  type ClosureState,
  closureSpanLabel,
  closureWindow,
  upcomingClosures,
} from "@/lib/closures";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { useHydrated } from "@/lib/use-hydrated";
import { INPUT, keepTyped, SettingsResult } from "./settings-ui";

// The design spec's minimum touch target; the touch size alone is 48 px.
const TARGET = "min-h-11";
const LINK =
  "text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4";
const IDLE: ClosureState = { status: "idle" };
const CHECK_FIELDS: ClosureState = {
  status: "error",
  kind: "invalid",
  message: "Check the closed days.",
  nextStep: "Fix the highlighted fields.",
};

export interface ClosedDaysProps {
  /** Every closure the business has had, earliest first; null when they could not be read. */
  closures: BookingClosurePublic[] | null;
  /** Owners and admins add and reopen; members only read. */
  editable: boolean;
  orgSlug: string;
  /** Today on the business clock, so past closures are not listed. */
  today: string;
  zone: string;
}

export function ClosedDays({
  closures,
  editable,
  orgSlug,
  today,
  zone,
}: ClosedDaysProps) {
  const [notice, setNotice] = useState<ClosureState>(IDLE);
  const onReopened = useCallback((state: ClosureState) => setNotice(state), []);

  if (closures === null) {
    return (
      <p className="text-destructive font-medium" role="alert">
        Closed days could not be loaded. Try again later.
      </p>
    );
  }
  const upcoming = upcomingClosures(closures, today);
  return (
    <>
      {upcoming.length === 0 ? (
        <Empty className="border-border border">
          <EmptyHeader>
            <EmptyTitle>No closed days planned.</EmptyTitle>
            <EmptyDescription>
              {editable
                ? "Add a day below when the business is shut, such as a public holiday. Until then, customers can book every day."
                : "An owner or admin can add closed days here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((item) => {
            const span = closureSpanLabel(item);
            return (
              <li
                className="border-border flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                key={item.id}
              >
                <div className="space-y-1">
                  <p className="font-medium">{span}</p>
                  {item.reason ? (
                    <p className="text-muted-foreground text-sm">
                      {item.reason}
                    </p>
                  ) : null}
                </div>
                {editable ? (
                  <ReopenClosure
                    closureId={item.id}
                    onReopened={onReopened}
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
          <h4 className="font-medium">Add closed days</h4>
          <ClosureForm orgSlug={orgSlug} zone={zone} />
        </div>
      ) : null}
    </>
  );
}

/** The row's trigger and its confirm step. A fresh form opens each time. */
function ReopenClosure({
  closureId,
  onReopened,
  orgSlug,
  span,
}: {
  closureId: string;
  onReopened: (state: ClosureState) => void;
  orgSlug: string;
  span: string;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const reopened = useCallback(
    (state: ClosureState) => {
      setOpen(false);
      onReopened(state);
    },
    [onReopened]
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
        Reopen
        <span className="sr-only"> {span}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <ReopenForm
          closureId={closureId}
          key={opened}
          onDone={reopened}
          orgSlug={orgSlug}
          span={span}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReopenForm({
  closureId,
  onDone,
  orgSlug,
  span,
}: {
  closureId: string;
  onDone: (state: ClosureState) => void;
  orgSlug: string;
  span: string;
}) {
  const [state, formAction, pending] = useActionState<ClosureState, FormData>(
    reopenClosureAction.bind(null, orgSlug, closureId),
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
        <AlertDialogTitle>Reopen these days?</AlertDialogTitle>
        <AlertDialogDescription>
          {span}. Customers can book on these days again, in the weekly hours.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <SettingsResult pending={pending} state={state} />
      <AlertDialogFooter>
        <AlertDialogCancel className={TARGET} size="touch">
          Keep it closed
        </AlertDialogCancel>
        <Button
          className={TARGET}
          disabled={pending}
          size="touch"
          type="submit"
          variant="destructive"
        >
          {pending ? "Reopening..." : "Reopen these days"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * The add form. The end day follows the start day until it is changed. Each
 * day is checked before the save; a refusal keeps every value and marks the
 * field at fault. After a save the bookings inside the closure are listed.
 */
function ClosureForm({ orgSlug, zone }: { orgSlug: string; zone: string }) {
  const [state, formAction, pending] = useActionState<ClosureState, FormData>(
    saveClosureAction.bind(null, orgSlug),
    IDLE
  );
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [endFollows, setEndFollows] = useState(true);
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<ClosureFieldErrors>({});
  const prefix = useId();
  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();

  useEffect(() => {
    if (state.status === "success") {
      setStartsOn("");
      setEndsOn("");
      setEndFollows(true);
      setReason("");
    }
  }, [state]);

  function changeStart(value: string) {
    setStartsOn(value);
    if (endFollows) {
      setEndsOn(value);
    }
  }

  function changeEnd(value: string) {
    setEndsOn(value);
    setEndFollows(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const check = closureWindow(startsOn, endsOn);
    if (!check.ok) {
      event.preventDefault();
      setChecked(check.fields);
      return;
    }
    setChecked({});
    keepTyped(formAction)(event);
  }

  const clientRefused = Object.keys(checked).length > 0;
  const shown: ClosureState = clientRefused ? CHECK_FIELDS : state;
  const serverFields: ClosureFieldErrors =
    state.status === "error" ? (state.fields ?? {}) : {};
  const fields = clientRefused ? checked : serverFields;

  return (
    // noValidate: the day checks here name the field; the browser's own
    // "required" bubble would stop the submit before they could show.
    <form className="space-y-5" noValidate onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <DayField
          error={fields.startsOn}
          id={`${prefix}-starts`}
          label="Start date"
          name="startsOn"
          onChange={changeStart}
          value={startsOn}
        />
        <DayField
          error={fields.endsOn}
          hint="Same day as the start unless you change it."
          id={`${prefix}-ends`}
          label="End date"
          name="endsOn"
          onChange={changeEnd}
          value={endsOn}
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
          maxLength={CLOSURE_REASON_MAX}
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: Christmas"
          value={reason}
        />
        <FieldError id={`${prefix}-reason-error`} message={fields.reason} />
      </div>
      <SettingsResult pending={pending} state={shown} />
      {state.status === "success" && state.affected?.length ? (
        <AffectedBookings
          bookings={state.affected}
          orgSlug={orgSlug}
          zone={zone}
        />
      ) : null}
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Add closed days"}
      </Button>
    </form>
  );
}

/** The bookings inside a new closure. They stand as they are; the studio follows them up. */
function AffectedBookings({
  bookings,
  orgSlug,
  zone,
}: {
  bookings: ClosureAffectedBooking[];
  orgSlug: string;
  zone: string;
}) {
  const count = bookings.length;
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 rounded-lg border p-3"
    >
      <h4 className="font-medium" id={headingId}>
        {count === 1
          ? "1 booking falls on these closed days"
          : `${count} bookings fall on these closed days`}
      </h4>
      <p className="text-muted-foreground text-sm">
        They are not cancelled. Customers keep their times, so contact each one
        or move the booking to another time from its page.
      </p>
      <ul className="space-y-1">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <Link
              className={LINK}
              href={`/studio/${orgSlug}/bookings/${booking.id}`}
            >
              {booking.customerFirstName ?? "Customer"},{" "}
              {formatDateTime(booking.startsAt, zone)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayField({
  error,
  hint,
  id,
  label,
  name,
  onChange,
  value,
}: {
  error: string | undefined;
  hint?: string;
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="space-y-1">
      <Label className="font-medium" htmlFor={id}>
        {label}
      </Label>
      <Input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={INPUT}
        id={id}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        type="date"
        value={value}
      />
      {hint ? (
        <p className="text-muted-foreground text-sm" id={hintId}>
          {hint}
        </p>
      ) : null}
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
