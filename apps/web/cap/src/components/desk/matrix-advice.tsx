"use client";

import type { IbfSuggestion } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { type FormEvent, useId, useState, useTransition } from "react";
import { suggestIbfAction } from "@/app/desk/matrix/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";
import { colourWord, IMPACTS, LIKELIHOODS } from "@/lib/desk/ibf";

/**
 * Advice from the impact matrix for one likelihood and impact. It shows the
 * colour and wording and never writes to a warning: the forecaster decides.
 */
export function MatrixAdvice({ kind }: { kind: string }) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [likelihood, setLikelihood] = useState("");
  const [impact, setImpact] = useState("");
  const [advice, setAdvice] = useState<IbfSuggestion | null>(null);
  const [error, setError] = useState<DeskError | null>(null);

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAdvice(null);
    startTransition(async () => {
      const outcome = await suggestIbfAction({ impact, kind, likelihood });
      if (outcome.ok) {
        setAdvice(outcome.suggestion);
      } else {
        setError(outcome.error);
      }
    });
  }

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="space-y-4 rounded-lg border p-4"
    >
      <h2 className="font-semibold text-lg" id={`${formId}-title`}>
        Advice for one likelihood and impact
      </h2>
      <form
        aria-busy={pending}
        className="flex flex-wrap items-end gap-3"
        onSubmit={check}
      >
        <label
          className="flex flex-col gap-1 text-body-sm"
          htmlFor={`${formId}-likelihood`}
        >
          Likelihood
          <NativeSelect
            disabled={pending}
            id={`${formId}-likelihood`}
            onChange={(event) => setLikelihood(event.target.value)}
            required
            value={likelihood}
          >
            <option value="">Choose</option>
            {LIKELIHOODS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label
          className="flex flex-col gap-1 text-body-sm"
          htmlFor={`${formId}-impact`}
        >
          Impact
          <NativeSelect
            disabled={pending}
            id={`${formId}-impact`}
            onChange={(event) => setImpact(event.target.value)}
            required
            value={impact}
          >
            <option value="">Choose</option>
            {IMPACTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button disabled={pending || !likelihood || !impact} type="submit">
          {pending ? "Checking…" : "Check advice"}
        </Button>
      </form>

      <DeskErrorNotice error={error} />

      {advice ? (
        <div className="space-y-2 text-body-sm" role="status">
          <p>
            <strong>Advised colour: </strong>
            {colourWord(advice.colour)} ({advice.severity} severity)
          </p>
          <p>{advice.meaning}</p>
          {advice.available ? null : (
            <p className="text-muted-foreground">
              No approved wording exists for this hazard yet. Only the colour is
              advised.
            </p>
          )}
        </div>
      ) : null}

      <p className="text-caption text-muted-foreground">
        Advice only. Nothing has been filled in or saved. Choose the colour and
        wording yourself when you write the warning.
      </p>
    </section>
  );
}
