"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const WARNING_LEVELS = ["yellow", "orange", "red"] as const;
export type WarningLevel = (typeof WARNING_LEVELS)[number];

/**
 * Raise a GMS alert to a CAP warning (ADR-0051). `onRaise` saves the alert
 * draft, asks FastAPI for the pre-filled CAP draft and resolves to its id, or
 * to an error message. The green alert itself is left in force.
 */
export function RaiseToWarningDialog({
  onOpenChange,
  onRaise,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onRaise: (
    level: WarningLevel
  ) => Promise<{ alertId: string } | { error: string }>;
  open: boolean;
}) {
  const router = useRouter();
  const [level, setLevel] = useState<WarningLevel>("yellow");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setPending(true);
    setError("");
    try {
      const result = await onRaise(level);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.push(`/cap/admin/${result.alertId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogTitle>Raise to warning</AlertDialogTitle>
        <AlertDialogDescription>
          This saves the alert as a draft, then opens a new CAP warning draft
          filled in from it. Nothing is published until the warning is approved
          and published in CAP. The green alert stays in force until you
          withdraw it.
        </AlertDialogDescription>
        <fieldset className="space-y-2">
          <legend className="font-medium text-sm">Warning colour</legend>
          {WARNING_LEVELS.map((option) => (
            <label className="flex items-center gap-2 text-sm" key={option}>
              <input
                checked={level === option}
                name="warning-level"
                onChange={() => setLevel(option)}
                type="radio"
                value={option}
              />
              <span className="capitalize">{option}</span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              // Keep the dialog open until the warning draft exists.
              event.preventDefault();
              confirm();
            }}
          >
            {pending ? "Raising…" : "Raise to warning"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
