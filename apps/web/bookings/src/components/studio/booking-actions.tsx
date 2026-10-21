"use client";

// Booking actions on the detail screen for owners and admins. Which buttons
// show follows the API's legal transitions (`availableActions`); the API
// still decides. Destructive or final steps ask first in an alert dialog, and
// every result is announced (role="status" for success, role="alert" for a
// refusal or a warning) and takes focus, because the button that was pressed
// is usually gone afterwards. Targets are 44 px or more so the phone is as
// usable as the desk.

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
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import {
  type ReactNode,
  type Ref,
  useActionState,
  useEffect,
  useId,
  useRef,
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

// The design spec's minimum touch target; the touch size alone is 48 px.
const TARGET = "min-h-11";

export interface BookingActionsProps {
  bookingId: string;
  orgSlug: string;
  /**
   * A captured deposit is still held: offer the refund choice on cancel and
   * mention the full refund on decline. False while a deposit is awaited
   * (the API decides) and once nothing is left to refund.
   */
  refundable: boolean;
  /** The booking's start has passed (server clock at render). */
  started: boolean;
  status: BookingStatus;
}

export function BookingActions({
  bookingId,
  orgSlug,
  refundable,
  started,
  status,
}: BookingActionsProps) {
  const [notice, setNotice] = useState<ActionState>(IDLE);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const keys = availableActions(status, started);

  // The pressed button is often gone after a final action: land on the result.
  useEffect(() => {
    if (notice.status === "done") {
      noticeRef.current?.focus();
    }
  }, [notice]);

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
              description={`The customer is emailed your reason and the time is released.${
                refundable ? " Any deposit is refunded in full." : ""
              }`}
              onResult={setNotice}
              submitLabel="Decline request"
              title="Decline this request?"
              triggerLabel="Decline"
            />
          ) : null}
          {keys.includes("cancel") ? (
            <ReasonDialog
              action={cancelBookingAction.bind(null, orgSlug, bookingId)}
              description="The customer is emailed your reason and the time is released."
              onResult={setNotice}
              refundChoice={refundable}
              submitLabel="Cancel booking"
              title="Cancel this booking?"
              triggerLabel="Cancel booking"
            />
          ) : null}
        </div>
      )}
      <Notice noticeRef={noticeRef} state={notice} />
    </section>
  );
}

function Notice({
  noticeRef,
  state,
}: {
  noticeRef: Ref<HTMLParagraphElement>;
  state: ActionState;
}) {
  if (state.status === "done") {
    // A warning (the refund failed) must interrupt; plain success is polite.
    return (
      <p
        className={
          state.warning
            ? "rounded-lg border border-destructive/40 bg-destructive/10 p-3 font-medium"
            : "rounded-lg border border-border bg-muted p-3 font-medium"
        }
        ref={noticeRef}
        role={state.warning ? "alert" : "status"}
        tabIndex={-1}
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
      <Button className={TARGET} disabled={pending} size="touch" type="submit">
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

const REFUND_CHOICES = [
  { value: "policy", label: "Follow the business policy" },
  { value: "refund", label: "Refund the deposit" },
  { value: "keep", label: "Keep the deposit" },
] as const;

/** Decline or cancel: a required reason, and the deposit choice when one is held. */
function ReasonDialog({
  action,
  description,
  onResult,
  refundChoice = false,
  submitLabel,
  title,
  triggerLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  description: string;
  onResult: (state: ActionState) => void;
  refundChoice?: boolean;
  submitLabel: string;
  title: string;
  triggerLabel: string;
}) {
  const reasonId = useId();
  const hintId = useId();
  const policyHintId = useId();
  return (
    <DialogShell
      action={action}
      description={description}
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
              aria-describedby={hintId}
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
          {refundChoice ? (
            <fieldset
              aria-describedby={policyHintId}
              className="space-y-1 border-0 p-0"
            >
              <legend className="font-medium text-sm">Deposit</legend>
              {REFUND_CHOICES.map((choice) => (
                <Label
                  className={`${TARGET} items-center gap-3`}
                  key={choice.value}
                >
                  <input
                    className="size-5 accent-primary"
                    defaultChecked={choice.value === "policy"}
                    name="refundChoice"
                    type="radio"
                    value={choice.value}
                  />
                  {choice.label}
                </Label>
              ))}
              <p className="text-muted-foreground text-sm" id={policyHintId}>
                The business policy refunds if the booking is more than the
                cancellation cutoff away.
              </p>
            </fieldset>
          ) : null}
        </div>
      )}
    </DialogShell>
  );
}

/**
 * The trigger and the dialog. Each opening mounts a fresh form (keyed on a
 * counter), so a refusal from last time never greets the next attempt.
 */
function DialogShell({
  action,
  children,
  description,
  onResult,
  submitLabel,
  title,
  tone,
  triggerLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children?: (error: boolean) => ReactNode;
  description: string;
  onResult: (state: ActionState) => void;
  submitLabel: string;
  title: string;
  tone: "default" | "destructive";
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);

  function change(next: boolean) {
    if (next) {
      setOpened((count) => count + 1);
    }
    setOpen(next);
  }

  return (
    <AlertDialog onOpenChange={change} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            className={TARGET}
            size="touch"
            variant={tone === "destructive" ? "destructive" : "outline"}
          />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DialogForm
          action={action}
          description={description}
          key={opened}
          onDone={(state) => {
            setOpen(false);
            onResult(state);
          }}
          submitLabel={submitLabel}
          title={title}
          tone={tone}
        >
          {children}
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DialogForm({
  action,
  children,
  description,
  onDone,
  submitLabel,
  title,
  tone,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children?: (error: boolean) => ReactNode;
  description: string;
  onDone: (state: ActionState) => void;
  submitLabel: string;
  title: string;
  tone: "default" | "destructive";
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  useEffect(() => {
    if (state.status === "done") {
      onDone(state);
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {children?.(state.status === "error")}
      {state.status === "error" ? <ErrorBox state={state} /> : null}
      <AlertDialogFooter>
        <AlertDialogCancel className={TARGET} size="touch">
          Go back
        </AlertDialogCancel>
        <Button
          className={TARGET}
          disabled={pending}
          size="touch"
          type="submit"
          variant={tone === "destructive" ? "destructive" : "default"}
        >
          {pending ? "Saving..." : submitLabel}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
