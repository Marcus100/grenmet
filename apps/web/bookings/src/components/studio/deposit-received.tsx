"use client";

// The deposit a customer pays the business by hand (business-collected mode,
// #1869). Staff mark it received with how and when it arrived, or take that
// back with Undo. Barrels takes no part in the payment: the copy says so. The
// dialog is the confirm step; results are announced (role="status" success,
// role="alert" refusal) and take focus, as in the other booking actions.

import type {
  BookingDepositReceivedMethod,
  BookingStatus,
} from "@barrelsgd/api-client";
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
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  markDepositReceivedAction,
  undoDepositReceivedAction,
} from "@/app/studio/[orgSlug]/bookings/[id]/actions";
import { CARD } from "@/components/studio/studio-ui";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { IDLE } from "@/lib/studio-action-state";
import { DEPOSIT_METHOD_LABEL, DEPOSIT_METHODS } from "@/lib/studio-view";

const TARGET = "min-h-11";
const METHODS = DEPOSIT_METHODS;

/** Undo and a new receipt are offered only while the API accepts them. */
const OPEN_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
];

export interface DepositReceivedProps {
  /** The business's deposit, formatted. Display only. */
  amountLabel: string;
  bookingId: string;
  /** The booking can take a receipt now (see `canMarkDepositReceived`). */
  canMark: boolean;
  /** The latest instant a receipt may carry, on the business's clock ("YYYY-MM-DDTHH:MM"). */
  latest: string;
  orgSlug: string;
  receivedAt?: string | null;
  receivedMethod?: BookingDepositReceivedMethod | null;
  receivedReference?: string | null;
  /** The booking's status (Undo is offered only while it is open). */
  status: BookingStatus;
  /** The business's IANA timezone, for the time shown. */
  timezone: string;
}

export function DepositReceived({
  amountLabel,
  bookingId,
  canMark,
  latest,
  orgSlug,
  receivedAt,
  receivedMethod,
  receivedReference,
  status,
  timezone,
}: DepositReceivedProps) {
  // Only a saved change is announced here. Refusals stay inside the dialog
  // that made the request, so the alert is never behind the modal.
  const [saved, setSaved] = useState<string | null>(null);
  const savedRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (saved !== null) {
      savedRef.current?.focus();
    }
  }, [saved]);

  if (!(receivedAt || canMark) && saved === null) {
    return null;
  }

  return (
    <section
      aria-labelledby="deposit-received-title"
      className={`${CARD} space-y-3`}
    >
      <h2 className="text-lg font-semibold" id="deposit-received-title">
        Deposit paid to the business
      </h2>
      {receivedAt ? (
        <div className="space-y-3">
          <p className="font-medium">
            {receivedLine({
              method: receivedMethod,
              reference: receivedReference,
              timezone,
              when: receivedAt,
            })}
          </p>
          {OPEN_STATUSES.includes(status) ? (
            <UndoDialog
              bookingId={bookingId}
              onSaved={setSaved}
              orgSlug={orgSlug}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-foreground/80">
            {amountLabel} is paid straight to the business, not through Barrels.
            Mark it received once it arrives.
          </p>
          <MarkDialog
            amountLabel={amountLabel}
            bookingId={bookingId}
            latest={latest}
            onSaved={setSaved}
            orgSlug={orgSlug}
          />
        </div>
      )}
      {saved === null ? null : (
        <p
          className="border-border bg-muted rounded-lg border p-3 font-medium"
          ref={savedRef}
          role="status"
          tabIndex={-1}
        >
          {saved}
        </p>
      )}
    </section>
  );
}

/** "Deposit received · Cash · Thu 12 Nov, 10:30 · ref 1234". */
export function receivedLine({
  method,
  reference,
  timezone,
  when,
}: {
  method: BookingDepositReceivedMethod | null | undefined;
  reference: string | null | undefined;
  timezone: string;
  when: string;
}): string {
  const parts = ["Deposit received"];
  if (method) {
    parts.push(DEPOSIT_METHOD_LABEL[method]);
  }
  parts.push(formatDateTime(when, timezone));
  if (reference) {
    parts.push(`ref ${reference}`);
  }
  return parts.join(" · ");
}

function MarkDialog({
  amountLabel,
  bookingId,
  latest,
  onSaved,
  orgSlug,
}: {
  amountLabel: string;
  bookingId: string;
  latest: string;
  onSaved: (message: string) => void;
  orgSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  // Stable, so the form's effect runs once per saved change.
  const saved = useCallback(
    (message: string) => {
      onSaved(message);
      setOpen(false);
    },
    [onSaved]
  );

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (next) {
          setOpened((count) => count + 1);
        }
        setOpen(next);
      }}
      open={open}
    >
      <AlertDialogTrigger
        render={<Button className={TARGET} size="touch" variant="outline" />}
      >
        Deposit received
      </AlertDialogTrigger>
      <AlertDialogContent>
        <MarkForm
          amountLabel={amountLabel}
          bookingId={bookingId}
          key={opened}
          latest={latest}
          onSaved={saved}
          orgSlug={orgSlug}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MarkForm({
  amountLabel,
  bookingId,
  latest,
  onSaved,
  orgSlug,
}: {
  amountLabel: string;
  bookingId: string;
  latest: string;
  onSaved: (message: string) => void;
  orgSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    markDepositReceivedAction.bind(null, orgSlug, bookingId),
    IDLE
  );
  const methodId = useId();
  const referenceId = useId();
  const whenId = useId();
  const whenHintId = useId();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.message);
    }
    if (state.status === "error") {
      errorRef.current?.focus();
    }
  }, [state, onSaved]);

  return (
    <form className="grid gap-4" onSubmit={keepValuesOnSubmit(formAction)}>
      <AlertDialogHeader>
        <AlertDialogTitle>Mark the deposit as received?</AlertDialogTitle>
        <AlertDialogDescription>
          The deposit shows as paid and the customer's booking page stops asking
          for it. Barrels does not record a payment, and the customer is not
          emailed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <p className="border-border bg-muted rounded-lg border p-3 font-semibold">
        Deposit: {amountLabel}
      </p>
      <div className="space-y-1 text-left">
        <Label className="font-medium" htmlFor={methodId}>
          How was it paid?
        </Label>
        <NativeSelect
          className="w-full [&_select]:h-11"
          defaultValue="cash"
          id={methodId}
          name="method"
          required
        >
          {METHODS.map((method) => (
            <NativeSelectOption key={method} value={method}>
              {DEPOSIT_METHOD_LABEL[method]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1 text-left">
        <Label className="font-medium" htmlFor={referenceId}>
          Reference (optional)
        </Label>
        <Input
          autoComplete="off"
          className="h-11"
          id={referenceId}
          maxLength={100}
          name="reference"
        />
      </div>
      <div className="space-y-1 text-left">
        <Label className="font-medium" htmlFor={whenId}>
          When it arrived (optional)
        </Label>
        <Input
          aria-describedby={whenHintId}
          className="h-11"
          id={whenId}
          max={latest}
          name="receivedAt"
          type="datetime-local"
        />
        <p className="text-muted-foreground text-sm" id={whenHintId}>
          Leave it empty for now. It cannot be later than now.
        </p>
      </div>
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
      <AlertDialogFooter>
        <AlertDialogCancel className={TARGET} size="touch">
          Go back
        </AlertDialogCancel>
        <Button
          className={TARGET}
          disabled={pending}
          size="touch"
          type="submit"
        >
          {pending ? "Saving..." : "Mark deposit received"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function UndoDialog({
  bookingId,
  onSaved,
  orgSlug,
}: {
  bookingId: string;
  onSaved: (message: string) => void;
  orgSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    undoDepositReceivedAction.bind(null, orgSlug, bookingId),
    IDLE
  );
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.message);
      setOpen(false);
    }
    if (state.status === "error") {
      errorRef.current?.focus();
    }
  }, [state, onSaved]);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={<Button className={TARGET} size="touch" variant="outline" />}
      >
        Undo
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              The deposit shows as due again, and the booking page asks for it.
              The customer is not emailed. This is recorded in the booking's
              history.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
          <AlertDialogFooter>
            <AlertDialogCancel className={TARGET} size="touch">
              Keep it received
            </AlertDialogCancel>
            <Button
              className={TARGET}
              disabled={pending}
              size="touch"
              type="submit"
              variant="destructive"
            >
              {pending ? "Undoing..." : "Undo receipt"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
