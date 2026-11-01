"use client";

import { useHrUpdatePayrollExportSettings } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { PayrollProblem } from "../payroll-states";
import {
  BANK_COLUMN_LABEL,
  GL_ACCOUNT_LABEL,
  NOT_STORED_NOTE,
} from "./export-labels";

export interface ExportSettingsInput {
  available_bank_columns: string[];
  bank_columns: string[];
  gl_accounts: Record<string, string>;
  organisation_id: string;
}

/**
 * Chooses the bank file columns and GL account codes. Needs organisation-wide
 * rates.manage and two-step verification; the API checks both.
 */
export function ExportSettingsForm({
  settings,
  securityUrl,
}: {
  settings: ExportSettingsInput;
  securityUrl: string;
}) {
  const router = useRouter();
  const save = useHrUpdatePayrollExportSettings();
  const [columns, setColumns] = useState<string[]>(settings.bank_columns);
  const [accounts, setAccounts] = useState<Record<string, string>>(
    settings.gl_accounts
  );
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );

  function toggleColumn(key: string, checked: boolean) {
    setColumns((current) =>
      checked
        ? settings.available_bank_columns.filter(
            (column) => column === key || current.includes(column)
          )
        : current.filter((column) => column !== key)
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (columns.length === 0) {
      setProblem({ text: "Choose at least one bank file column.", mfa: false });
      return;
    }
    try {
      await save.mutateAsync({
        body: {
          organisation_id: settings.organisation_id,
          bank_columns: columns,
          gl_accounts: accounts,
        },
      });
      toast.success("Export settings saved");
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected") {
        reportError(error, "hr-payroll-export-settings");
      }
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      <fieldset className="space-y-3">
        <legend className="font-semibold text-base">Bank file columns</legend>
        <p className="text-muted-foreground text-sm">
          Columns appear in the order the file lists them. {NOT_STORED_NOTE}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {settings.available_bank_columns.map((key) => (
            <div className="flex min-h-11 items-center gap-3 text-sm" key={key}>
              <Checkbox
                checked={columns.includes(key)}
                id={`bank-${key}`}
                onCheckedChange={(checked) =>
                  toggleColumn(key, checked === true)
                }
              />
              <FieldLabel htmlFor={`bank-${key}`}>
                {BANK_COLUMN_LABEL[key] ?? key}
              </FieldLabel>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-base">GL account codes</legend>
        <p className="text-muted-foreground text-sm">
          Leave a code empty if the journal does not need it yet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(GL_ACCOUNT_LABEL).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`gl-${key}`}>
                {GL_ACCOUNT_LABEL[key]}
              </FieldLabel>
              <Input
                autoComplete="off"
                className="font-mono"
                id={`gl-${key}`}
                maxLength={60}
                onChange={(event) =>
                  setAccounts((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                value={accounts[key] ?? ""}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Needs two-step verification.
      </p>
      <Button disabled={save.isPending} type="submit">
        Save export settings
      </Button>
    </form>
  );
}
