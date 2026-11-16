import type {
  PrintixImportReport,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { useId, useState } from "react";
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

/** A small sample to start from. Barcodes are 12 characters, so offline checking stays on. */
export const SAMPLE_CSV = [
  "number,barcode",
  "101,PX0000000101",
  "102,PX0000000102",
  "103,PX0000000103",
  "",
].join("\n");

/** The sample as a data link, so no object URL is needed and nothing is stored. */
export const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

function countWords(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The offline-checking warning, in plain words, or null when both counts are
 * zero. Offline checking is off while either count is above zero.
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
  return `Offline checking will be off for this event: ${parts.join(" and ")}.`;
}

/** Whether the trial is clean enough to import: no problems, and something to add. */
export function canImport(
  report: PrintixImportReport | null
): report is PrintixImportReport {
  return (
    report !== null &&
    report.errors.length === 0 &&
    !report.errors_truncated &&
    report.to_add > 0
  );
}

/** The trial's answer: what would be added, every problem by line, and the warnings. */
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
  const ready = canImport(report);
  return (
    <section aria-label="Trial result" className="flex flex-col gap-4">
      <p className="text-base font-semibold">
        {report.to_add === 0
          ? "Nothing new to add."
          : `${countWords(report.to_add, "row", "rows")} to add from ${report.rows} read.`}
      </p>

      {report.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
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
        </div>
      ) : null}

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {report.warnings.map((text) => (
            <li className={NOTE} key={text}>
              {text}
            </li>
          ))}
        </ul>
      ) : null}

      {warning ? (
        <p className={ALERT} role="alert">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          aria-busy={busy}
          className={BUTTON_PRIMARY}
          disabled={!ready || busy}
          onClick={onImport}
          type="button"
        >
          {`Import ${countWords(report.to_add, "ticket", "tickets")}`}
        </button>
        <button
          className={BUTTON_SECONDARY}
          onClick={onChooseAnother}
          type="button"
        >
          Choose another file
        </button>
      </div>
    </section>
  );
}

interface ImportSectionProps {
  readonly closed: boolean;
  readonly eventId: string;
  readonly onChanged: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

type Step =
  | { readonly kind: "choose" }
  | { readonly kind: "trial"; readonly report: PrintixImportReport }
  | { readonly kind: "done"; readonly added: number };

/**
 * Imports the printer's ticket list in two steps: a trial that writes nothing,
 * then the import itself, enabled only when the trial was clean. The file is held
 * in this component's state and dropped after the import; nothing is stored.
 */
export function ImportSection({
  session,
  organisation,
  eventId,
  closed,
  onChanged,
}: ImportSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const fileId = useId();
  const hintId = useId();

  function pick(chosen: File | null) {
    setProblem(null);
    setStep({ kind: "choose" });
    if (chosen !== null && chosen.size > MAX_IMPORT_BYTES) {
      setFile(null);
      setProblem({ kind: "too-large" });
      return;
    }
    setFile(chosen);
  }

  async function check() {
    if (file === null) {
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await importTickets(
      session,
      organisation.id,
      eventId,
      file,
      true
    );
    setBusy(false);
    if (outcome.ok) {
      setStep({ kind: "trial", report: outcome.value });
    } else {
      setProblem(outcome.problem);
    }
  }

  async function importAll() {
    if (file === null) {
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await importTickets(
      session,
      organisation.id,
      eventId,
      file,
      false
    );
    setBusy(false);
    if (outcome.ok && outcome.value.applied) {
      // The file is no longer needed: drop it and clear the picker.
      setFile(null);
      setInputKey((count) => count + 1);
      setStep({ kind: "done", added: outcome.value.to_add });
      onChanged();
    } else if (outcome.ok) {
      setStep({ kind: "trial", report: outcome.value });
    } else {
      setProblem(outcome.problem);
    }
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
          scanner reads). A blank barcode uses the printed number, which turns
          offline checking off.
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
          className="file:bg-px-surface file:text-px-paper file:border-px-rule text-base file:mr-3 file:min-h-11 file:rounded-xl file:border file:px-3"
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
        <p className={NOTE} role="status">
          Imported {countWords(step.added, "ticket", "tickets")}.
        </p>
      ) : null}

      {file !== null && step.kind !== "trial" ? (
        <button
          aria-busy={busy}
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={check}
          type="button"
        >
          {busy ? "Checking…" : "Check the file first"}
        </button>
      ) : null}

      {step.kind === "trial" ? (
        <TrialReport
          busy={busy}
          onChooseAnother={() => setStep({ kind: "choose" })}
          onImport={importAll}
          report={step.report}
        />
      ) : null}
    </section>
  );
}
