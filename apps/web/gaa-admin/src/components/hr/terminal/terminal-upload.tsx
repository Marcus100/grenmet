"use client";

import {
  type TerminalImportPublic,
  useHrImportTerminalPunches,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";
import {
  attentionTotal,
  countsSummary,
  errorStatus,
  invalidateAfterTerminalChange,
} from "./terminal-format";

// The API reads at most 1 MB and 1000 lines; refuse bigger files up front.
const MAX_BYTES = 1024 * 1024;
const EXPECTED_STATUSES = [400, 403, 409, 413, 422];

function uploadError(error: unknown): string {
  const status = errorStatus(error);
  if (status === 403)
    return "You cannot import punches for this department. You need roster management in it.";
  if (status === 400 || status === 409 || status === 413)
    return hrApiErrorMessage(error);
  return "The file was not imported. Try again.";
}

function ImportResult({ result }: { result: TerminalImportPublic }) {
  const attention = attentionTotal(result.outcomes);
  return (
    <section
      aria-label="Import result"
      className="bg-card space-y-2 rounded-lg border p-4 text-sm"
    >
      <p className="font-medium">
        {result.new_punches} new{" "}
        {result.new_punches === 1 ? "punch" : "punches"} from “{result.terminal}
        ”
        {result.duplicates > 0
          ? `, ${result.duplicates} already imported and skipped`
          : ""}
        .
      </p>
      {result.new_punches > 0 ? (
        <p className="text-muted-foreground">
          {countsSummary(result.outcomes)}.
        </p>
      ) : null}
      {attention > 0 ? (
        <p>
          {attention} {attention === 1 ? "punch needs" : "punches need"} your
          attention below.
        </p>
      ) : null}
      {result.errors.length > 0 ? (
        <div className="space-y-1">
          <p className="text-destructive font-medium">
            {result.errors.length}{" "}
            {result.errors.length === 1 ? "line was" : "lines were"} not read:
          </p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
            {result.errors.slice(0, 20).map((error) => (
              <li key={`${error.line}-${error.message}`}>
                Line {error.line}: {error.message}
              </li>
            ))}
          </ul>
          {result.errors.length > 20 ? (
            <p className="text-muted-foreground">
              And {result.errors.length - 20} more. Check the export and upload
              it again; lines already imported are skipped.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function TerminalUpload({ departmentId }: { departmentId: string }) {
  const queryClient = useQueryClient();
  const importPunches = useHrImportTerminalPunches();
  const [file, setFile] = useState<File>();
  const [terminal, setTerminal] = useState("");
  const [problem, setProblem] = useState<string>();
  const [result, setResult] = useState<TerminalImportPublic>();
  const [inputKey, setInputKey] = useState(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const label = terminal.trim();
    if (!label) {
      setProblem(
        "Name the terminal, for example “Main gate”, so a second upload of the same file is recognised."
      );
      return;
    }
    if (!file) {
      setProblem("Choose the export file from the terminal.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem(
        "The file is larger than 1 MB. Export a shorter date range and upload each part."
      );
      return;
    }
    setProblem(undefined);
    try {
      const summary = await importPunches.mutateAsync({
        body: { file, department_id: departmentId, terminal: label },
      });
      setResult(summary);
      setFile(undefined);
      setInputKey((key) => key + 1);
      toast.success(
        `Imported ${summary.new_punches} new ${summary.new_punches === 1 ? "punch" : "punches"}`
      );
      await invalidateAfterTerminalChange(queryClient);
    } catch (error) {
      if (!EXPECTED_STATUSES.includes(errorStatus(error) ?? 0))
        reportError(error, "hr-terminal-import");
      setProblem(uploadError(error));
    }
  }

  return (
    <section aria-labelledby="terminal-upload-heading" className="space-y-3">
      <div>
        <h2
          className="text-lg font-semibold tracking-tight"
          id="terminal-upload-heading"
        >
          Upload an export
        </h2>
        <p className="text-muted-foreground text-sm">
          Export the attendance log from the fingerprint or fob terminal (ATTLOG
          text, or a CSV with device_user_id and punched_at columns) and upload
          it here. Times are read as Grenada time. Uploading the same file again
          imports nothing twice. One upload takes at most 1000 lines.
        </p>
      </div>
      <form
        className="bg-card max-w-3xl space-y-4 rounded-xl border p-4"
        noValidate
        onSubmit={submit}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="terminal-label">Terminal name</FieldLabel>
            <Input
              id="terminal-label"
              maxLength={60}
              onChange={(event) => setTerminal(event.target.value)}
              placeholder="Main gate"
              value={terminal}
            />
            <FieldDescription>
              Use the same name every time you upload from this terminal.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="terminal-file">Export file</FieldLabel>
            <Input
              accept=".txt,.dat,.csv,text/plain,text/csv"
              id="terminal-file"
              key={inputKey}
              onChange={(event) => setFile(event.target.files?.[0])}
              type="file"
            />
          </Field>
        </FieldGroup>
        {problem ? (
          <p className="text-destructive text-sm" role="alert">
            {problem}
          </p>
        ) : null}
        <Button disabled={importPunches.isPending} type="submit">
          {importPunches.isPending ? (
            <Spinner className="size-4" data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          Import punches
        </Button>
      </form>
      {result ? <ImportResult result={result} /> : null}
    </section>
  );
}
