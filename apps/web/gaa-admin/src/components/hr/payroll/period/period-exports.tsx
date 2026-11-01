"use client";

import {
  useHrExportBankTransferCsv,
  useHrExportGlJournalCsv,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { downloadBlob } from "@/components/document/pdf-preview";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { PayrollProblem } from "../payroll-states";

/**
 * Bank and GL journal files for the period. Both need export permission and
 * two-step verification, and are audited on the server.
 */
export function PeriodExports({
  periodStart,
  periodId,
  securityUrl,
}: {
  periodId: string;
  periodStart: string;
  securityUrl: string;
}) {
  const bank = useHrExportBankTransferCsv();
  const gl = useHrExportGlJournalCsv();
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );
  const busy = bank.isPending || gl.isPending;

  async function save(kind: "bank" | "gl") {
    setProblem(null);
    try {
      const content =
        kind === "bank"
          ? await bank.mutateAsync({ path: { period_id: periodId } })
          : await gl.mutateAsync({ path: { period_id: periodId } });
      const name = kind === "bank" ? "bank-transfer" : "gl-journal";
      downloadBlob(
        new Blob([String(content)], { type: "text/csv;charset=utf-8" }),
        `${name}-${periodStart}.csv`
      );
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected")
        reportError(error, "hr-payroll-export");
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  return (
    <section aria-label="Bank and GL files" className="space-y-3">
      <h3 className="font-semibold text-base">Bank and GL files</h3>
      <p className="text-muted-foreground text-sm">
        Bank account numbers are not stored, so the bank file shows NOT STORED
        in its account column.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => save("bank")}
          type="button"
          variant="outline"
        >
          Download bank file
        </Button>
        <Button
          disabled={busy}
          onClick={() => save("gl")}
          type="button"
          variant="outline"
        >
          Download GL journal
        </Button>
      </div>
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
    </section>
  );
}
