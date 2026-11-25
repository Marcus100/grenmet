"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { cn } from "@barrelsgd/ui/lib/utils";
import { type FormEvent, type ReactNode, useId, useState } from "react";

/** What the app's action reports back. The kit shows `message` as written text. */
export interface ConfirmResult {
  readonly message: string;
  readonly ok: boolean;
}

export interface ConfirmActionProps {
  /** The confirm button's label: "Cancel booking", not "OK". */
  readonly confirmLabel: string;
  /** Say what will change, in plain words. */
  readonly description: ReactNode;
  /** Style the confirm button as destructive. */
  readonly destructive?: boolean;
  /**
   * Runs the action. It is the app's own (a Server Action or a mutation); the
   * kit only waits for it and shows the result. A thrown error goes to the
   * app's `error.tsx`.
   */
  readonly onConfirm: (input: {
    readonly reason: string;
  }) => ConfirmResult | Promise<ConfirmResult>;
  /** Called after each result, for example to refresh the page. */
  readonly onResult?: (result: ConfirmResult) => void;
  /** Ask for a reason, which the app can keep with the record. */
  readonly reason?: {
    readonly label: string;
    readonly required?: boolean;
  };
  readonly title: string;
  readonly triggerClassName?: string;
  /** The label of the button that opens the dialog. */
  readonly triggerLabel: ReactNode;
  readonly triggerVariant?: "default" | "destructive" | "outline" | "ghost";
}

/**
 * Recorded or destructive actions sit behind a dialog that says what will
 * change, with an optional reason. The result comes back as a written notice.
 */
export function ConfirmAction({
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
  onResult,
  reason,
  title,
  triggerClassName,
  triggerLabel,
  triggerVariant,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [, setFailure] = useState<unknown>();
  const reasonId = useId();

  const needsReason = Boolean(reason?.required) && reasonText.trim() === "";
  const done = result?.ok === true;

  const handleOpenChange = (next: boolean) => {
    if (pending) {
      return;
    }
    setOpen(next);
    if (!next) {
      setResult(null);
      setReasonText("");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || needsReason) {
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const outcome = await onConfirm({ reason: reasonText.trim() });
      setResult(outcome);
      onResult?.(outcome);
    } catch (error) {
      // Unexpected errors belong to the app's error boundary.
      setFailure(() => {
        throw error;
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button
            className={cn("min-h-11 sm:min-h-0", triggerClassName)}
            variant={
              triggerVariant ?? (destructive ? "destructive" : "outline")
            }
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {reason && !done ? (
            <div className="grid gap-1.5">
              <Label htmlFor={reasonId}>
                {reason.label}
                {reason.required ? " (required)" : ""}
              </Label>
              <Textarea
                aria-required={reason.required ? true : undefined}
                disabled={pending}
                id={reasonId}
                onChange={(event) => setReasonText(event.target.value)}
                value={reasonText}
              />
            </div>
          ) : null}
          {result ? (
            <p
              className={cn(
                "rounded-md border p-3 text-sm",
                result.ok ? "bg-muted" : "border-destructive text-destructive"
              )}
              role={result.ok ? "status" : "alert"}
            >
              {result.message}
            </p>
          ) : null}
          <DialogFooter>
            {done ? (
              <Button
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  disabled={pending}
                  onClick={() => handleOpenChange(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  aria-busy={pending}
                  disabled={pending || needsReason}
                  type="submit"
                  variant={destructive ? "destructive" : "default"}
                >
                  {pending ? (
                    <Spinner aria-hidden="true" role="presentation" />
                  ) : null}
                  {confirmLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
