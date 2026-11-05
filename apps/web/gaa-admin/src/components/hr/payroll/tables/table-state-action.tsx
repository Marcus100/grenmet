"use client";

import { useHrSetStatutoryTableState } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { PayrollProblem } from "../payroll-states";

export type TableKind = "tax" | "social-insurance" | "deduction";

const NOTE_MIN = 3;

/**
 * Confirm a PROVISIONAL table, or reopen a confirmed one. Needs the
 * confirm permission and two-step verification; the creator cannot confirm it.
 */
export function TableStateAction({
  kind,
  tableId,
  securityUrl,
}: {
  kind: TableKind;
  tableId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const update = useHrSetStatutoryTableState();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    "CONFIRMED" | "OWNER_CONFIRMED" | "PROVISIONAL"
  >("CONFIRMED");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (note.trim().length < NOTE_MIN) {
      setProblem({
        text: "Write a short note on where the rule is confirmed.",
        mfa: false,
      });
      return;
    }
    try {
      await update.mutateAsync({
        path: { kind, table_id: tableId },
        body: { rule_state: state, note: note.trim() },
      });
      toast.success(
        state === "PROVISIONAL" ? "Table reopened" : "Table confirmed"
      );
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected")
        reportError(error, "hr-payroll-table-state");
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        Confirm or reopen
      </Button>
    );
  }
  return (
    <form
      className="w-full space-y-3 rounded-lg border p-3"
      onSubmit={onSubmit}
    >
      <Field>
        <FieldLabel htmlFor={`state-${tableId}`}>New state</FieldLabel>
        <NativeSelect
          id={`state-${tableId}`}
          onChange={(e) => setState(e.target.value as typeof state)}
          value={state}
        >
          <option value="CONFIRMED">Confirmed in writing</option>
          <option value="OWNER_CONFIRMED">Confirmed by the owner</option>
          <option value="PROVISIONAL">Reopen as provisional</option>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`note-${tableId}`}>
          Note (where it is confirmed)
        </FieldLabel>
        <Input
          id={`note-${tableId}`}
          onChange={(e) => setNote(e.target.value)}
          value={note}
        />
      </Field>
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={update.isPending} type="submit">
          Save
        </Button>
        <Button onClick={() => setOpen(false)} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
