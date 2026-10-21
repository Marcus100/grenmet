"use client";

// Booking actions on the detail screen for owners and admins. Which buttons
// show follows the API's legal transitions (`availableActions`); the API
// still decides. Destructive or final steps ask first in an alert dialog, and
// every result is announced (role="status" for success, role="alert" for
// a refusal). Targets are 44 px or more so the phone is as usable as the desk.

import type { BookingStatus } from "@barrelsgd/api-client";
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
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useId,
  useState,
} from "react";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  declineBookingAction,
  noShowBookingAction,
} from "@/app/studio/[orgSlug]/bookings/[id]/actions";
import { type ActionState, IDLE } from "@/lib/studio-action-state";
import { availableActions } from "@/lib/studio-view";

export interface BookingActionsProps {
  bookingId: string;
  /** A deposit was captured: offer the refund choice when cancelling. */
  depositCaptured: boolean;
  orgSlug: string;
  /** The booking's start has passed (server clock at render). */
  started: boolean;
  status: BookingStatus;
}

export function BookingActions({
  bookingId,
  depositCaptured,
  orgSlug,
  started,
  status,
}: BookingActionsProps) {
  const [notice, setNotice] = useState<ActionState>(IDLE);
  const keys = availableActions(status, started);

  return (
    <section aria-labelledby="actions-title" className="space-y-3">
      <h2 className="font-semibold text-lg" id="actions-title">
        Actions
      </h2>
      {keys.length === 0 ? (
        <p className="text-muted-foreground">
          This booking is final, so there is nothing more to do.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keys.includes("confirm") ? (
            <ConfirmButton
              bookingId={bookingId}
              onResult={setNotice}
              orgSlug={orgSlug}
            />
          ) : null}
          {keys.includes("complete") ? (
            <FinalDialog
              action={() => completeBookingAction(orgSlug, bookingId)}
              description="The visit happened. This cannot be undone."
              onResult={setNotice}
              submitLabel="Mark completed"
              title="Mark this booking completed?"
            />
          ) : null}
          {keys.includes("no_show") ? (
            <FinalDialog
              action={() => noShowBookingAction(orgSlug, bookingId)}
              description="The customer did not come. This cannot be undone."
              onResult={setNotice}
              submitLabel="Mark no-show"
              title="Mark this booking as a no-show?"
              tone="destructive"
            />
          ) : null}
          {keys.includes("decline") ? (
            <ReasonDialog
              action={declineBookingAction.bind(null, orgSlug, bookingId)}
              description="The customer is emailed your reason and the time is released."
              onResult={setNotice}
              submitLabel="Decline request"
              title="Decline this request?"
              triggerLabel="Decline"
            />
          ) : null}
          {keys.includes("cancel") ? (
            <ReasonDialog
              action={cancelBookingAction.bind(null, orgSlug, bookingId)}
              depositCaptured={depositCaptured}
              description="The customer is emailed your reason and the time is released."
              onResult={setNotice}
              submitLabel="Cancel booking"
              title="Cancel this booking?"
              triggerLabel="Cancel booking"
            />
          ) : null}
        </div>
      )}
      <Notice state={notice} />
    </section>
  );
}

function Notice({ state }: { state: ActionState }) {
  if (state.status === "done") {
    return (
      <p
        className="rounded-lg border border-border bg-muted p-3 font-medium"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  if (state.status === "error") {
    return <ErrorBox state={state} />;
  }
  return <p className="sr-only" role="status" />;
}

function ErrorBox({
  id,
  state,
}: {
  id?: string;
  state: Extract<ActionState, { status: "error" }>;
}) {
  return (
    <div
      className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
      id={id}
      role="alert"
    >
      <p className="font-semibold">{state.message}</p>
      <p className="text-muted-foreground">{state.nextStep}</p>
    </div>
  );
}

function ConfirmButton({
  bookingId,
  onResult,
  orgSlug,
}: {
  bookingId: string;
  onResult: (state: ActionState) => void;
  orgSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    () => confirmBookingAction(orgSlug, bookingId),
    IDLE
  );
  useEffect(() => {
    if (state.status !== "idle") {
      onResult(state);
    }
  }, [state, onResult]);
  return (
    <form action={formAction}>
      <Button disabled={pending} size="touch" type="submit">
        {pending ? "Confirming..." : "Confirm booking"}
      </Button>
    </form>
  );
}

/** An irreversible step with no fields: ask once, then run. */
function FinalDialog({
  action,
  description,
  onResult,
  submitLabel,
  title,
  tone = "default",
}: {
  action: () => Promise<ActionState>;
  description: string;
  onResult: (state: ActionState) => void;
  submitLabel: string;
  title: string;
  tone?: "default" | "destructive";
}) {
  return (
    <DialogShell
      action={() => action()}
      description={description}
      onResult={onResult}
      submitLabel={submitLabel}
      title={title}
      tone={tone}
      triggerLabel={submitLabel}
    />
  );
}

/** Decline or cancel: a required reason, and the deposit choice when one was taken. */
function ReasonDialog({
  action,
  depositCaptured = false,
  description,
  onResult,
  submitLabel,
  title,
  triggerLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  depositCaptured?: boolean;
  description: string;
  onResult: (state: ActionState) => void;
  submitLabel: string;
  title: string;
  triggerLabel: string;
}) {
  const reasonId = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <DialogShell
      action={action}
      description={description}
      errorId={errorId}
      onResult={onResult}
      submitLabel={submitLabel}
      title={title}
      tone="destructive"
      triggerLabel={triggerLabel}
    >
      {(error) => (
        <div className="space-y-3 text-left">
          <div className="space-y-1">
            <Label className="font-medium" htmlFor={reasonId}>
              Reason (the customer sees this)
            </Label>
            <Textarea
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              aria-invalid={error ? true : undefined}
              id={reasonId}
              maxLength={300}
              name="reason"
              required
              rows={3}
            />
            <p className="text-muted-foreground text-sm" id={hintId}>
              Up to 300 characters.
            </p>
          </div>
          {depositCaptured ? (
            <>
              <input name="refundChoice" type="hidden" value="1" />
              <Label className="min-h-11 items-center gap-3">
                <Checkbox defaultChecked name="refundDeposit" />
                Refund the deposit
              </Label>
            </>
          ) : null}
        </div>
      )}
    </DialogShell>
  );
}

function DialogShell({
  action,
  children,
  description,
  errorId,
  onResult,
  submitLabel,
  title,
  tone,
  triggerLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children?: (error: boolean) => ReactNode;
  description: string;
  errorId?: string;
  onResult: (state: ActionState) => void;
  submitLabel: string;
  title: string;
  tone: "default" | "destructive";
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, IDLE);

  useEffect(() => {
    if (state.status === "done") {
      setOpen(false);
      onResult(state);
    }
  }, [state, onResult]);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            size="touch"
            variant={tone === "destructive" ? "destructive" : "outline"}
          />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children?.(state.status === "error")}
          {state.status === "error" ? (
            <ErrorBox id={errorId} state={state} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" size="touch">
              Go back
            </AlertDialogCancel>
            <Button
              disabled={pending}
              size="touch"
              type="submit"
              variant={tone === "destructive" ? "destructive" : "default"}
            >
              {pending ? "Saving..." : submitLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
