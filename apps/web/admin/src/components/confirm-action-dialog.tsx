"use client";

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
import { cn } from "@barrelsgd/ui/lib/utils";
import { type FormEvent, useState, useTransition } from "react";

// 44 px touch targets on coarse pointers for every button in the dialog.
const COARSE_TARGET = "pointer-coarse:min-h-11";

/**
 * The console's shared confirmation for destructive or recorded actions
 * (docs/design/admin.md: destructive actions confirm first). The trigger opens a
 * dialog that says what changes. Confirm runs the server action with `fields`
 * as form data, then closes the dialog whether it worked or not: the action
 * revalidates the same page, so this component stays mounted and must not stay
 * open over the result. Cancel changes nothing.
 */
export function ConfirmActionDialog({
  action,
  cancelLabel = "Keep it",
  className,
  confirmLabel,
  description,
  destructive = true,
  fields,
  title,
  triggerLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  cancelLabel?: string;
  /** Extra classes for the trigger and the confirm button (e.g. touch sizing). */
  className?: string;
  confirmLabel: string;
  description: string;
  /** Destructive styling for removals; a reversible change uses the plain style. */
  destructive?: boolean;
  fields: Record<string, string>;
  title: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await action(data);
      } finally {
        // Redirects and revalidation both leave this mounted; close either way.
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            className={cn(
              destructive && "border-destructive/40 text-destructive",
              COARSE_TARGET,
              className
            )}
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={confirm}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel className={COARSE_TARGET}>
              {cancelLabel}
            </AlertDialogCancel>
            <Button
              className={cn(COARSE_TARGET, className)}
              disabled={pending}
              type="submit"
              variant={destructive ? "destructive" : "default"}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
