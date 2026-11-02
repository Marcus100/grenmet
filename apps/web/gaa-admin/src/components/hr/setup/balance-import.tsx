"use client";

import {
  type BalanceImportResult,
  useHrImportStaffBalances,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";

interface BalanceImportProps {
  organisationId: string;
}

/**
 * Opening leave balances from a spreadsheet export. A file is checked first and
 * nothing is posted until every row is valid and the administrator applies it.
 */
export function BalanceImport({ organisationId }: BalanceImportProps) {
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [asOf, setAsOf] = useState("");
  const [result, setResult] = useState<BalanceImportResult>();
  const importMutation = useHrImportStaffBalances();
  const ready = csv.trim() !== "" && source.trim().length >= 3 && asOf !== "";

  async function run(apply: boolean) {
    try {
      const outcome = await importMutation.mutateAsync({
        body: {
          organisation_id: organisationId,
          source: source.trim(),
          as_of: asOf,
          csv,
          apply,
        },
      });
      setResult(outcome);
      if (outcome.applied) {
        toast.success(`Posted ${outcome.valid} opening balance(s)`);
        setCsv("");
      }
    } catch (error) {
      reportError(error, "balance-import");
      toast.error("Could not read that file. Check its columns and try again.");
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setResult(undefined);
  }

  return (
    <section aria-label="Import opening leave balances" className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Import opening leave balances</h2>
        <p className="text-muted-foreground text-sm">
          Upload a CSV from the official leave records with the columns{" "}
          <code>employee_number</code>, <code>leave_type</code> and{" "}
          <code>balance</code>. Other columns are ignored. Leave types must be
          exact codes such as VACATION or SICK.
        </p>
      </div>
      <FieldGroup className="max-w-xl">
        <Field>
          <FieldLabel htmlFor="balance-source">
            Source of the figures
          </FieldLabel>
          <Input
            id="balance-source"
            onChange={(event) => setSource(event.target.value)}
            value={source}
          />
          <FieldDescription>
            For example, the name and date of the report these came from.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="balance-as-of">Balances as of</FieldLabel>
          <Input
            id="balance-as-of"
            onChange={(event) => setAsOf(event.target.value)}
            type="date"
            value={asOf}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="balance-file">CSV file</FieldLabel>
          <Input
            accept=".csv,text/csv"
            id="balance-file"
            onChange={(event) => loadFile(event.target.files?.[0])}
            type="file"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="balance-csv">Or paste the rows</FieldLabel>
          <Textarea
            id="balance-csv"
            onChange={(event) => {
              setCsv(event.target.value);
              setResult(undefined);
            }}
            rows={6}
            value={csv}
          />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          disabled={!ready || importMutation.isPending}
          onClick={() => run(false)}
          type="button"
          variant="outline"
        >
          Check file
        </Button>
        <Button
          disabled={
            !ready ||
            importMutation.isPending ||
            !result ||
            result.invalid > 0 ||
            result.applied
          }
          onClick={() => run(true)}
          type="button"
        >
          Post balances
        </Button>
      </div>
      {result ? (
        <div className="space-y-2">
          <p role="status">
            {result.applied ? "Posted. " : ""}
            {result.valid} of {result.total} rows valid
            {result.invalid > 0
              ? `; fix the ${result.invalid} problem row(s) before posting.`
              : "."}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Leave type</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.row}>
                  <TableCell>{row.row}</TableCell>
                  <TableCell>{row.employee_number}</TableCell>
                  <TableCell>{row.leave_type}</TableCell>
                  <TableCell>{row.balance ?? ""}</TableCell>
                  <TableCell>{row.message ?? "OK"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
