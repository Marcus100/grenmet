"use client";

import { hrGetPayslipPdf } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { downloadBlob } from "@/components/document/pdf-preview";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { PayrollProblem } from "../payroll-states";

/**
 * Downloads one payslip PDF through an authenticated request: the session
 * cookie travels with the request, so no secret is ever put in the URL.
 */
export function PayslipDownload({
  filename,
  payslipId,
  securityUrl,
}: {
  filename: string;
  payslipId: string;
  securityUrl: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );

  async function onClick() {
    setBusy(true);
    setProblem(null);
    try {
      const blob = await hrGetPayslipPdf({
        path: { payslip_id: payslipId },
      }).unwrap();
      downloadBlob(blob, filename);
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected")
        reportError(error, "hr-payroll-payslip-pdf");
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={busy}
        onClick={onClick}
        size="sm"
        type="button"
        variant="outline"
      >
        Download PDF
      </Button>
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
    </div>
  );
}
