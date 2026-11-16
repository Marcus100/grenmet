import type {
  PrintixImportReport,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { useId, useRef, useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import {
  ALERT,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  NOTE,
} from "@/organiser/styles";
import { importTickets } from "@/organiser/write-api";

/** The server refuses a file over this size (MAX_IMPORT_BYTES). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** A small sample. Every row has a barcode, and each is 12 characters, so offline checking stays on. */
export const SAMPLE_CSV = [
  "number,barcode",
  "101,PX0000000101",
  "102,PX0000000102",
  "103,PX0000000103",
  "",
].join("\n");

/** The sample as a data link, so no object URL is needed and nothing is stored. */
export const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

/** Every ticket needs its barcode: the server refuses a real import without one. */
export const BLANK_BARCODE_HEADING =
  "Every ticket needs its barcode. Ask the printer for the full list.";

function countWords(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The offline-checking warning, or null when both counts are zero. It does not
 * block an import: it says offline checking will be off for the event.
 */
export function weakBarcodeWarning(report: PrintixImportReport): string | null {
  // Optional in the generated type (an older answer may omit them): missing means none.
  const short = report.short_barcodes ?? 0;
  const equal = report.barcode_equals_number ?? 0;
  const parts: string[] = [];
  if (short > 0) {
    parts.push(
      `${countWords(short, "barcode is", "barcodes are")} shorter than 12 characters`
    );
  }
  if (equal > 0) {
    parts.push(
      `${countWords(equal, "is", "are")} the same as the printed number`
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return `Across this event, ${parts.join(" and ")}. Offline checking will be off for this event.`;
}

/**
 * Whether a real import would be accepted, judged from the trial. The server's
 * only warnings are about blank (defaulted) barcodes, and a real import refuses
 * those, so any warning blocks. Problems block too, and so does a truncated list.
 */
export function canImport(
  report: PrintixImportReport | null
): report is PrintixImportReport {
  return (
    report !== null &&
    report.errors.length === 0 &&
    !report.errors_truncated &&
    report.warnings.length === 0 &&
    report.to_add > 0
  );
}

/** The trial's answer: what would be added, every blocking problem, and the offline warning. */
function TrialReport({
  report,
  busy,
  onImport,
  onChooseAnother,
}: {
  readonly report: PrintixImportReport;
  readonly busy: boolean;
  readonly onImport: () => void;
  readonly onChooseAnother: () => void;
}) {
  const warning = weakBarcodeWarning(report);
  return (
    <section aria-label="Trial result" className="flex flex-col gap-4">
      <p className="text-base font-semibold">
        {report.to_add === 0
          ? "Nothing new to add."
          : `${countWords(report.to_add, "row", "rows")} to add from ${report.rows} read.`}
      </p>
      <BlockingProblems report={report} />
      {warning ? (
        <p className={NOTE} role="status">
          {warning}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          aria-busy={busy}
          className={BUTTON_PRIMARY}
          disabled={!canImport(report) || busy}
          onClick={onImport}
          type="button"
        >
          {`Import ${countWords(report.to_add, "ticket", "tickets")}`}
        </button>
        <button
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={onChooseAnother}
          type="button"
        >
          Choose another file
        </button>
      </div>
    </section>
  );
}

/** Problems that block the import, listed by line where the server gives lines. */
function BlockingProblems({
  report,
}: {
  readonly report: PrintixImportReport;
}) {
  if (report.errors.length === 0 && report.warnings.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {report.warnings.length > 0 ? (
        <>
          <p className={ALERT} role="alert">
            {BLANK_BARCODE_HEADING}
          </p>
          <ul className="flex flex-col gap-2">
            {report.warnings.map((text) => (
              <li className={NOTE} key={text}>
                {text}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {report.errors.length > 0 ? (
        <>
          <p className="text-base font-semibold">Problems to fix first</p>
          <ul className="flex flex-col gap-2">
            {report.errors.map((issue) => (
              <li
                className="bg-px-surface border-px-rule rounded-xl border px-3 py-2 text-base"
                key={`${issue.line}-${issue.message}`}
              >
                Line {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
          {report.errors_truncated ? (
            <p className="text-px-muted text-sm">
              Only the first problems are listed. Fix these and check again.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

interface ImportSectionProps {
  readonly closed: boolean;
  readonly eventId: string;
  readonly onAnnounce: (text: string) => void;
  /** Called after a real import wrote tickets. */
  readonly onImported: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/**
 * The file a step is about. The trial keeps the exact File it checked, and the
 * import uploads that file, never whatever the picker shows later.
 */
type Step =
  | { readonly kind: "choose" }
  | {
      readonly kind: "trial";
      readonly file: File;
      readonly report: PrintixImportReport;
    }
  | {
      readonly kind: "refused";
      readonly file: File;
      readonly report: PrintixImportReport;
    }
  | {
      readonly kind: "done";
      readonly added: number;
      readonly warning: string | null;
    };

/**
 * Imports the printer's ticket list in two steps: a trial that writes nothing,
 * then the import itself, enabled only when the trial was clean. The file is held
 * in component state and dropped after a successful import; nothing is stored.
 */
export function ImportSection({
  session,
  organisation,
  eventId,
  closed,
  onImported,
  onAnnounce,
}: ImportSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the picked file changes: an answer for an older file is ignored.
  const generation = useRef(0);
  const fileId = useId();
  const hintId = useId();

  /** Forgets the file and the answer, and empties the picker. */
  function reset() {
    generation.current += 1;
    setFile(null);
    setInputKey((count) => count + 1);
    setProblem(null);
    setStep({ kind: "choose" });
  }

  function pick(chosen: File | null) {
    generation.current += 1;
    setProblem(null);
    setStep({ kind: "choose" });
    if (chosen !== null && chosen.size > MAX_IMPORT_BYTES) {
      setFile(null);
      setProblem({ kind: "too-large" });
      return;
    }
    setFile(chosen);
  }

  async function check(chosen: File) {
    const asked = generation.current;
    setBusy(true);
    setProblem(null);
    const outcome = await importTickets(
      session,
      organisation.id,
      eventId,
      chosen,
      true
    );
    setBusy(false);
    if (asked !== generation.current) {
      return;
    }
    if (outcome.ok) {
      setStep({ kind: "trial", file: chosen, report: outcome.value });
    } else {
      setProblem(outcome.problem);
    }
  }

  async function importAll(trial: { readonly file: File }) {
    setBusy(true);
    setProblem(null);
    const outcome = await importTickets(
      session,
      organisation.id,
      eventId,
      trial.file,
      false
    );
    setBusy(false);
    if (!outcome.ok) {
      setProblem(outcome.problem);
      return;
    }
    if (outcome.value.applied) {
      generation.current += 1;
      setFile(null);
      setInputKey((count) => count + 1);
      const added = outcome.value.to_add;
      setStep({
        kind: "done",
        added,
        warning: weakBarcodeWarning(outcome.value),
      });
      onAnnounce(`Imported ${countWords(added, "ticket", "tickets")}.`);
      onImported();
      return;
    }
    // The server wrote nothing and says why: show its problems, not a silent return.
    setStep({ kind: "refused", file: trial.file, report: outcome.value });
    onAnnounce("The import was not written. Nothing was added.");
  }

  if (closed) {
    return (
      <section aria-labelledby="import-title" className="flex flex-col gap-3">
        <h3 className="text-xl font-semibold" id="import-title">
          Import tickets
        </h3>
        <p className={NOTE} role="status">
          This event is closed, so tickets cannot be imported.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="import-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold" id="import-title">
          Import tickets
        </h3>
        <p className="text-px-muted text-sm" id={hintId}>
          Choose the printer&apos;s CSV file. It needs a header row with a{" "}
          <code className="font-mono">number</code> column (the printed number)
          and a <code className="font-mono">barcode</code> column (what the
          scanner reads). Every row needs a barcode.
        </p>
        <a
          className="text-px-green min-h-11 w-fit text-base underline"
          download="printix-tickets-sample.csv"
          href={SAMPLE_HREF}
        >
          Download a small sample file
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold" htmlFor={fileId}>
          Ticket list (CSV, up to 2 MB)
        </label>
        <input
          accept=".csv,text/csv"
          aria-describedby={hintId}
          className="file:bg-px-surface file:text-px-paper file:border-px-rule text-base file:mr-3 file:min-h-11 file:rounded-xl file:border file:px-3 disabled:opacity-50"
          disabled={busy}
          id={fileId}
          key={inputKey}
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
          type="file"
        />
      </div>

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {step.kind === "done" ? (
        <div className="flex flex-col gap-3">
          <p className={NOTE} role="status">
            Imported {countWords(step.added, "ticket", "tickets")}.
          </p>
          {step.warning ? <p className={NOTE}>{step.warning}</p> : null}
        </div>
      ) : null}

      {file !== null && step.kind === "choose" ? (
        <button
          aria-busy={busy}
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={() => check(file)}
          type="button"
        >
          {busy ? "Checking…" : "Check the file first"}
        </button>
      ) : null}

      {step.kind === "trial" ? (
        <TrialReport
          busy={busy}
          onChooseAnother={reset}
          onImport={() => importAll(step)}
          report={step.report}
        />
      ) : null}

      {step.kind === "refused" ? (
        <section
          aria-label="Import not written"
          className="flex flex-col gap-4"
        >
          <h4 className="text-lg font-semibold">
            The import was not written. Nothing was added.
          </h4>
          <BlockingProblems report={step.report} />
          <div className="flex flex-wrap gap-3">
            <button
              aria-busy={busy}
              className={BUTTON_SECONDARY}
              disabled={busy}
              onClick={() => check(step.file)}
              type="button"
            >
              Check the file again
            </button>
            <button
              className={BUTTON_SECONDARY}
              disabled={busy}
              onClick={reset}
              type="button"
            >
              Choose another file
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
