"use client";

// Pieces shared by the settings forms: a labelled field and the result line.
// A refusal is role="alert" and a save is role="status"; both take focus so a
// screen reader and a keyboard user land on the outcome.

import { Label } from "@barrelsgd/ui/components/ui/label";
import { type FormEvent, startTransition, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/studio-action-state";

export const INPUT = "h-11";
export const SELECT = "w-full [&_select]:h-11";

export function SettingsField({
  children,
  hint,
  id,
  label,
}: {
  children: (describedBy: string | undefined) => React.ReactNode;
  hint?: string | undefined;
  id: string;
  label: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1">
      <Label className="font-medium" htmlFor={id}>
        {label}
      </Label>
      {children(hint ? hintId : undefined)}
      {hint ? (
        <p className="text-muted-foreground text-sm" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A checkbox row with a 44 px target. */
export function SettingsCheck({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked?: boolean;
  label: string;
  name: string;
}) {
  return (
    <Label className="min-h-11 items-center gap-3">
      <input
        className="size-5 accent-primary"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      {label}
    </Label>
  );
}

export function SettingsResult({
  pending,
  state,
}: {
  pending: boolean;
  state: ActionState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") {
      ref.current?.focus();
    }
  }, [state]);

  if (state.status === "error") {
    return (
      <div
        className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
        ref={ref}
        role="alert"
        tabIndex={-1}
      >
        <p className="font-semibold">{state.message}</p>
        <p className="text-muted-foreground">{state.nextStep}</p>
      </div>
    );
  }
  return (
    <div ref={ref} role="status" tabIndex={-1}>
      {pending ? <span className="sr-only">Saving</span> : null}
      {state.status === "done" ? (
        <p className="rounded-lg border border-border bg-muted p-3 font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A submit handler that sends the form to its action without React 19's
 * automatic form reset, so a refused save keeps what the person typed. Forms
 * that should start blank after a save reset themselves on success.
 */
export function keepTyped(formAction: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
}
