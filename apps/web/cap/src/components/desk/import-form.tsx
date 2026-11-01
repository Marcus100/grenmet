"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { importAlertAction } from "@/app/desk/import/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";
import type { ImportOutcome } from "@/lib/desk/import";

type Source = "url" | "xml";

const SOURCES: { value: Source; label: string }[] = [
  { value: "xml", label: "Paste CAP XML" },
  { value: "url", label: "Public https address" },
];

/** A saved import the API could not check against CAP 1.2 in full. */
interface SavedWithProblems {
  alertId: string;
  problems: string[];
}

/**
 * Imports one CAP document through a server action. The browser holds no
 * token and sends only the form values. A conformant import opens its draft;
 * a non-conformant one stays here, listing each problem, so nothing is hidden.
 */
export function ImportForm() {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<Source>("xml");
  const [value, setValue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<DeskError | null>(null);
  const [saved, setSaved] = useState<SavedWithProblems | null>(null);

  const canSubmit = !pending && reviewed && value.trim().length > 0;

  function resetFor(next: Source) {
    setSource(next);
    setValue("");
    setReviewed(false);
    setError(null);
    setSaved(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const outcome: ImportOutcome = await importAlertAction({
        reviewed: true,
        source,
        value,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      if (outcome.schemaConformant) {
        router.push(`/desk/alerts/${encodeURIComponent(outcome.alertId)}`);
        return;
      }
      setSaved({ alertId: outcome.alertId, problems: outcome.schemaProblems });
    });
  }

  const valueLabel =
    source === "xml" ? "CAP 1.2 XML document" : "Public https address";
  const hintId = `${formId}-hint`;

  return (
    <div className="space-y-6">
      <form aria-busy={pending} className="space-y-5" onSubmit={submit}>
        <fieldset className="space-y-3" disabled={pending}>
          <legend className="mb-2 font-medium">Where is the document?</legend>
          <div className="flex flex-wrap gap-5">
            {SOURCES.map((option) => (
              <label className="flex items-center gap-2" key={option.value}>
                <input
                  checked={source === option.value}
                  name="source"
                  onChange={() => resetFor(option.value)}
                  type="radio"
                  value={option.value}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-value`}>{valueLabel}</Label>
          <Textarea
            aria-describedby={hintId}
            className="min-h-40 font-mono text-body-sm"
            disabled={pending}
            id={`${formId}-value`}
            onChange={(event) => {
              setValue(event.target.value);
              setReviewed(false);
            }}
            required
            value={value}
          />
          <p className="text-caption text-muted-foreground" id={hintId}>
            {source === "xml"
              ? "Paste one complete CAP document. Nothing is saved until you press Import."
              : "Give the full public https address of one CAP document. Private or local addresses are refused."}
          </p>
        </div>

        <label className="flex items-start gap-2">
          <input
            checked={reviewed}
            disabled={pending}
            onChange={(event) => setReviewed(event.target.checked)}
            type="checkbox"
          />
          <span>
            I have checked the source. The imported alert will be a draft that I
            must review before it can be published.
          </span>
        </label>

        <Button disabled={!canSubmit} type="submit">
          {pending ? "Importing…" : "Import as draft"}
        </Button>
      </form>

      <DeskErrorNotice error={error} />

      {saved ? (
        <section
          aria-labelledby={`${formId}-saved`}
          className="space-y-3 rounded-lg border border-warning bg-warning-soft p-4 text-body-sm"
          role="status"
        >
          <h2
            className="font-semibold text-warning-soft-foreground"
            id={`${formId}-saved`}
          >
            Imported, but the document does not fully follow CAP 1.2
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {saved.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p>
            The draft is saved. Check each problem in it before you publish.
          </p>
          <Link
            className="font-medium text-info underline"
            href={`/desk/alerts/${encodeURIComponent(saved.alertId)}`}
          >
            Open the imported draft
          </Link>
        </section>
      ) : null}
    </div>
  );
}
