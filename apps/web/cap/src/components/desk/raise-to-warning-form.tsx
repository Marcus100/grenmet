"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { raiseToWarningAction } from "@/app/desk/escalations/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import { COLOUR_SURFACE } from "@/lib/desk/cap/cap-levels";
import type { DeskError } from "@/lib/desk/errors";
import {
  defaultColour,
  type MatrixSuggestion,
  MIN_OVERRIDE_REASON,
  reasonProblem,
  reasonRequired,
  WARNING_COLOURS,
  type WarningColour,
} from "@/lib/desk/escalations";
import { colourWord } from "@/lib/desk/ibf";

const OPTION =
  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border border-gm-border px-3 py-2 text-center font-semibold text-caption leading-caption has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gm-blue";

function matrixLine(suggestion: MatrixSuggestion): string {
  if (suggestion.kind === "suggested") {
    return `The impact matrix suggests ${colourWord(suggestion.colour)} for this likelihood and impact.`;
  }
  if (suggestion.kind === "none") {
    return "This alert has no likelihood and impact saved, so the matrix has no suggestion.";
  }
  return "The impact matrix could not be checked for this alert.";
}

/**
 * Raises one GMS alert to a CAP warning draft in a chosen colour. On success
 * the forecaster lands on the draft's edit page, or on the read view when the
 * warning is already in force. Nothing is submitted, approved,
 * published or sent here; FastAPI checks the permission and the reason again.
 */
export function RaiseToWarningForm({
  label,
  productId,
  revision,
  suggestion,
}: {
  label: string;
  productId: string;
  revision: number;
  suggestion: MatrixSuggestion;
}) {
  const router = useRouter();
  const idPrefix = useId();
  const [colour, setColour] = useState<WarningColour>(() =>
    defaultColour(suggestion)
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<DeskError | null>(null);
  const [pending, startTransition] = useTransition();

  const required = reasonRequired(suggestion, colour);
  const problem = reasonProblem(reason, required);
  const canRaise = !pending && problem === null;
  const problemId = `${idPrefix}-reason-problem`;

  function raise() {
    if (!canRaise) return;
    setError(null);
    startTransition(async () => {
      const outcome = await raiseToWarningAction({
        awarenessLevel: colour,
        overrideReason: reason.trim() === "" ? null : reason.trim(),
        productId,
        revision,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      router.push(
        outcome.editable
          ? `/desk/alerts/${outcome.alertId}/edit`
          : `/desk/alerts/${outcome.alertId}`
      );
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        raise();
      }}
    >
      <fieldset className="space-y-4 border-none p-0" disabled={pending}>
        <fieldset className="grid gap-1.5 border-none p-0">
          <legend className="text-gm-text-primary text-label mb-1.5">
            Warning colour
          </legend>
          <p className="text-muted-foreground text-body-sm">
            {matrixLine(suggestion)}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {WARNING_COLOURS.map((option) => {
              const selected = option === colour;
              return (
                <label
                  className={cn(
                    OPTION,
                    selected ? "border-transparent" : "text-gm-text-secondary"
                  )}
                  key={option}
                  style={selected ? COLOUR_SURFACE[option] : undefined}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    name={`${idPrefix}-colour`}
                    onChange={() => setColour(option)}
                    type="radio"
                    value={option}
                  />
                  {colourWord(option)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-1.5">
          <label
            className="text-gm-text-primary text-label"
            htmlFor={`${idPrefix}-reason`}
          >
            Reason{required ? " (required)" : " (only if the colour differs)"}
          </label>
          <Textarea
            aria-describedby={problem ? problemId : undefined}
            aria-invalid={problem ? true : undefined}
            id={`${idPrefix}-reason`}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            value={reason}
          />
          {problem ? (
            <p className="text-destructive text-body-sm" id={problemId}>
              {problem}
            </p>
          ) : (
            <p className="text-muted-foreground text-body-sm">
              At least {MIN_OVERRIDE_REASON} characters when the colour differs
              from the matrix suggestion. It is kept on the draft.
            </p>
          )}
        </div>
        <DeskErrorNotice error={error} />
        <Button className="min-h-11" disabled={!canRaise} type="submit">
          Raise to warning
          <span className="sr-only"> for {label}</span>
        </Button>
        {pending ? (
          <p className="text-muted-foreground text-body-sm" role="status">
            Creating the warning draft…
          </p>
        ) : null}
      </fieldset>
    </form>
  );
}
