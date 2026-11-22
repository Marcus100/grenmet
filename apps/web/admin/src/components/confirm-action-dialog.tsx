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
import { useState } from "react";

/**
 * The console's shared confirmation for destructive or recorded actions
 * (docs/design/admin.md: destructive actions confirm first). The trigger opens a
 * dialog that says what changes; only its confirm button submits the server
 * action, with `fields` sent as hidden inputs. Cancel changes nothing.
 */
export function ConfirmActionDialog({
  action,
  cancelLabel = "Keep it",
  confirmLabel,
  description,
  destructive = true,
  fields,
  title,
  triggerLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  /** Destructive styling for removals; a reversible change uses the plain style. */
  destructive?: boolean;
  fields: Record<string, string>;
  title: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            className={
              destructive ? "border-destructive/40 text-destructive" : undefined
            }
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
        <form action={action}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <Button
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
