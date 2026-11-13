"use client";

import {
  useHrApprovePayPeriodForIssue,
  useHrRefreshPayPeriodTableState,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { isPayrollQuery } from "../payroll-format";
import { PayrollProblem } from "../payroll-states";

/**
 * Refresh table states and approve the period for issue. Both need approval
 * permission, read access to amounts and two-step verification.
 */
export function IssueActions({
  blockerCount,
  canApprove,
  canRefresh,
  periodId,
  securityUrl,
}: {
  blockerCount: number;
  canApprove: boolean;
  canRefresh: boolean;
  periodId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = useHrRefreshPayPeriodTableState();
  const approve = useHrApprovePayPeriodForIssue();
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );
  const busy = refresh.isPending || approve.isPending;

  async function run(action: "refresh" | "approve") {
    setProblem(null);
    try {
      if (action === "refresh") {
        await refresh.mutateAsync({ path: { period_id: periodId } });
        toast.success("Table states refreshed");
      } else {
        await approve.mutateAsync({ path: { period_id: periodId } });
        toast.success("Approved for issue. Payslips were created.");
      }
      await queryClient.invalidateQueries({
        predicate: (query) => isPayrollQuery(query.queryKey),
      });
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected") {
        reportError(error, "hr-payroll-issue");
      }
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  if (!(canApprove || canRefresh)) {
    return null;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canRefresh ? (
          <Button
            disabled={busy}
            onClick={() => run("refresh")}
            type="button"
            variant="outline"
          >
            Refresh table state
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            disabled={busy || blockerCount > 0}
            onClick={() => run("approve")}
            type="button"
          >
            Approve for issue
          </Button>
        ) : null}
      </div>
      {blockerCount > 0 ? (
        <p className="text-muted-foreground text-sm">
          Approval is off until every blocker below is cleared.
        </p>
      ) : null}
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
    </div>
  );
}
