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
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { COLOUR_LABEL } from "@/lib/cap-levels";
import { useIbfSuggestion } from "./use-ibf-suggestion";

export const WARNING_LEVELS = ["yellow", "orange", "red"] as const;
export type WarningLevel = (typeof WARNING_LEVELS)[number];
/** FastAPI refuses an override reason shorter than this (cap/escalation.py). */
export const MIN_OVERRIDE_REASON = 10;

/**
 * Raise a GMS alert to a CAP warning (ADR-0051). `onRaise` saves the alert
 * draft, asks FastAPI for the pre-filled CAP draft and resolves to its id, or
 * to an error message. The green alert itself is left in force.
 */
export function RaiseToWarningDialog({
  onOpenChange,
  onRaise,
  open,
  kind = "",
  likelihood,
  impact,
}: {
  onOpenChange: (open: boolean) => void;
  /** The alert kind and its saved answers, to compare the colour with the matrix. */
  kind?: string;
  likelihood?: string;
  impact?: string;
  onRaise: (
    level: WarningLevel,
    overrideReason?: string
  ) => Promise<
    { alertId: string } | { error: string; existingAlertId?: string }
  >;
  open: boolean;
}) {
  const router = useRouter();
  const [level, setLevel] = useState<WarningLevel>("yellow");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [existingAlertId, setExistingAlertId] = useState("");
  const [reason, setReason] = useState("");
  const [levelChosen, setLevelChosen] = useState(false);
  const reasonId = useId();
  const state = useIbfSuggestion(kind, likelihood, impact);
  const suggested = state.status === "ready" ? state.suggestion.colour : null;
  // Until the forecaster picks a colour, follow the matrix when it asks for a warning.
  const shownLevel: WarningLevel =
    !levelChosen && suggested && suggested !== "green" ? suggested : level;
  const needsReason = suggested !== null && shownLevel !== suggested;
  // When the matrix could not be read, the forecaster may still explain the choice.
  const reasonOptional = state.status === "failed";
  const showReason = needsReason || reasonOptional;
  const trimmedReason = reason.trim();
  const reasonMissing = needsReason
    ? trimmedReason.length < MIN_OVERRIDE_REASON
    : reasonOptional &&
      trimmedReason.length > 0 &&
      trimmedReason.length < MIN_OVERRIDE_REASON;
  const suggestionLoading = state.status === "loading";

  async function confirm() {
    if (reasonMissing || suggestionLoading) return;
    setPending(true);
    setError("");
    setExistingAlertId("");
    try {
      const result = await onRaise(
        shownLevel,
        showReason && trimmedReason ? trimmedReason : undefined
      );
      if ("error" in result) {
        setError(result.error);
        setExistingAlertId(result.existingAlertId ?? "");
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
          <legend className="text-sm font-medium">Warning colour</legend>
          {WARNING_LEVELS.map((option) => (
            <label className="flex items-center gap-2 text-sm" key={option}>
              <input
                checked={shownLevel === option}
                name="warning-level"
                onChange={() => {
                  setLevel(option);
                  setLevelChosen(true);
                }}
                type="radio"
                value={option}
              />
              <span className="capitalize">{option}</span>
            </label>
          ))}
        </fieldset>
        {suggested ? (
          <p className="text-sm" data-testid="matrix-suggestion">
            The impact matrix suggests {COLOUR_LABEL[suggested]}.
          </p>
        ) : null}
        {showReason ? (
          <div className="space-y-2">
            <Label htmlFor={reasonId}>
              {needsReason
                ? "Reason for choosing a different colour (required)"
                : "Reason for choosing this colour (optional)"}
            </Label>
            <Textarea
              id={reasonId}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              Internal only. The reason is saved and audited for GMS review. It
              is never published and does not go into the public alert text.
              {needsReason ? "Write" : "If you write one, use"} at least{" "}
              {MIN_OVERRIDE_REASON} characters.
            </p>
          </div>
        ) : null}
        {suggestionLoading ? (
          <p className="text-muted-foreground text-sm">
            Checking the impact matrix…
          </p>
        ) : null}
        {reasonOptional ? (
          <p className="text-muted-foreground text-sm">
            The impact matrix could not be read, so the colour was not compared
            with it.
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {existingAlertId ? (
          <button
            className="text-left text-sm underline"
            onClick={() => {
              onOpenChange(false);
              router.push(`/cap/admin/${existingAlertId}`);
            }}
            type="button"
          >
            Open the existing warning draft
          </button>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || reasonMissing || suggestionLoading}
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
