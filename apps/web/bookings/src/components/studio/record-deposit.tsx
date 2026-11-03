"use client";

// "Record deposit received" for owners and admins: the customer paid the
// deposit by hand (cash, bank transfer, cheque). The dialog is the confirm
// step and shows the booking's own deposit; the amount is read-only text and is
// never sent, the API uses the booking's deposit. The idempotency key lives
// here, made on mount, kept on a timeout or server fault (the first attempt
// may have been recorded) and rotated when the API refused the content.
// Results are announced (role="status" success, role="alert" refusal).

import type { ManualMethod } from "@barrelsgd/api-client";
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
import { recordDepositAction } from "@/app/studio/[orgSlug]/bookings/[id]/actions";
import { keepValuesOnSubmit } from "@/lib/keep-values";
import { type ActionState, IDLE } from "@/lib/studio-action-state";
import { rotatesKey } from "@/lib/studio-view";

const TARGET = "min-h-11";

const METHOD_LABEL: Record<ManualMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};
const METHODS = Object.keys(METHOD_LABEL) as ManualMethod[];

// Refusals that mean the booking has moved on (the page refreshes under us):
// shown outside the dialog, because the button may be gone by then.
const PAGE_LEVEL = new Set(["conflict", "forbidden", "not_found"]);

export interface RecordDepositProps {
  /** The booking's deposit, already formatted. Display only. */
  amountLabel: string;
  bookingId: string;
  /** The deposit is still awaited (the page decides from the booking). */
  due: boolean;
  orgSlug: string;
  /** The booking asks for a deposit and is not closed. */
  takesDeposit: boolean;
}

export function RecordDeposit({
  amountLabel,
  bookingId,
  due,
  orgSlug,
  takesDeposit,
}: RecordDepositProps) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [notice, setNotice] = useState<ActionState>(IDLE);
  // Made on mount, not on the server, so Back (router cache) never restores
  // a used key. Empty until then; the submit stays off until it exists.
  const [key, setKey] = useState("");
  const noticeRef = useRef<HTMLParagraphElement & HTMLDivElement>(null);

  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (notice.status !== "idle") {
      noticeRef.current?.focus();
    }
  }, [notice]);

  // Stable, so the form's effect fires once per result and a key rotation
  // here never replays the same refusal.
  const result = useCallback((state: ActionState) => {
    if (state.status === "done") {
      setKey(crypto.randomUUID());
      setOpen(false);
      setNotice(state);
    } else if (state.status === "error") {
      if (rotatesKey(state.kind)) {
        setKey(crypto.randomUUID());
      }
      if (PAGE_LEVEL.has(state.kind)) {
        setOpen(false);
        setNotice(state);
      }
    }
  }, []);

  const canRecord = takesDeposit && due;
  if (!canRecord && notice.status === "idle") {
    return null;
  }

  return (
    <section aria-labelledby="deposit-title" className="space-y-3">
      <h2 className="text-lg font-semibold" id="deposit-title">
        Deposit
      </h2>
      {canRecord ? (
        <AlertDialog
          onOpenChange={(next) => {
            if (next) {
              setNotice(IDLE);
              setOpened((count) => count + 1);
            }
            setOpen(next);
          }}
          open={open}
        >
          <AlertDialogTrigger
            render={
              <Button className={TARGET} size="touch" variant="outline" />
            }
          >
            Record deposit received
          </AlertDialogTrigger>
          <AlertDialogContent>
            <DepositForm
              amountLabel={amountLabel}
              bookingId={bookingId}
              idempotencyKey={key}
              key={opened}
              onResult={result}
              orgSlug={orgSlug}
            />
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {notice.status === "done" ? (
        <p
          className="border-border bg-muted rounded-lg border p-3 font-medium"
          ref={noticeRef}
          role="status"
          tabIndex={-1}
        >
          {notice.message}
        </p>
      ) : null}
      {notice.status === "error" ? (
        <div
          className="border-destructive/40 bg-destructive/10 space-y-1 rounded-lg border p-3"
          ref={noticeRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">{notice.message}</p>
          <p className="text-muted-foreground">{notice.nextStep}</p>
        </div>
      ) : null}
      {notice.status === "idle" ? (
        <p className="sr-only" role="status" />
      ) : null}
    </section>
  );
}

function DepositForm({
  amountLabel,
  bookingId,
  idempotencyKey,
  onResult,
  orgSlug,
}: {
  amountLabel: string;
  bookingId: string;
  idempotencyKey: string;
  onResult: (state: ActionState) => void;
  orgSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordDepositAction.bind(null, orgSlug, bookingId),
    IDLE
  );
  const methodId = useId();
  const referenceId = useId();
  const hintId = useId();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") {
      onResult(state);
    }
    if (state.status === "error") {
      errorRef.current?.focus();
    }
  }, [state, onResult]);

  return (
    <form className="grid gap-4" onSubmit={keepValuesOnSubmit(formAction)}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <AlertDialogHeader>
        <AlertDialogTitle>Record the deposit as received?</AlertDialogTitle>
        <AlertDialogDescription>
          This marks the deposit as paid and confirms a booking that was waiting
          for it. It cannot be undone here.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <p className="border-border bg-muted rounded-lg border p-3 font-semibold">
        Deposit received: {amountLabel}
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
              {METHOD_LABEL[method]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1 text-left">
        <Label className="font-medium" htmlFor={referenceId}>
          Reference (optional)
        </Label>
        <Input
          aria-describedby={hintId}
          autoComplete="off"
          className="h-11"
          id={referenceId}
          maxLength={200}
          name="reference"
        />
        <p className="text-muted-foreground text-sm" id={hintId}>
          Receipt, cheque or transfer number.
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
          disabled={pending || idempotencyKey === ""}
          size="touch"
          type="submit"
        >
          {pending ? "Saving..." : "Record deposit"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
