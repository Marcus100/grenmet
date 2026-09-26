"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "./api";

/** A dialog form that saves through `save`, then refreshes server data. */
export function SaveDialog({
  children,
  description,
  onClose,
  save,
  submitLabel,
  success,
  title,
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  save: () => Promise<unknown>;
  submitLabel: string;
  success: string;
  title: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const mutation = useMutation({ mutationFn: save });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await mutation.mutateAsync();
      toast.success(success);
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "Could not save. Try again."));
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {children}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActiveCheckbox({
  checked,
  id,
  onChange,
}: {
  checked: boolean;
  id: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm" htmlFor={id}>
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onChange(Boolean(value))}
      />
      Active
    </label>
  );
}
