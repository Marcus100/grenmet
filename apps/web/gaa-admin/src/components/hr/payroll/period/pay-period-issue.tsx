import "server-only";
import { hrGetPayPeriod, hrGetPayPeriodSummary } from "@barrelsgd/api-client";
import { loadPayroll } from "../load-payroll";
import type { PayrollAccess } from "../payroll-access";
import { PayrollMfaRequired, PayrollNoAccess } from "../payroll-states";
import { PayPeriodIssueView } from "./pay-period-issue-view";

/** Server section: loads the summary and period, then renders the issue view. */
export async function PayPeriodIssue({
  access,
  periodId,
  securityUrl,
}: {
  access: PayrollAccess;
  periodId: string;
  securityUrl: string;
}) {
  if (!access.canReadAmounts) {
    return <PayrollNoAccess what="Pay summary and issue approval" />;
  }
  const path = { period_id: periodId };
  const [detail, summary] = await Promise.all([
    loadPayroll((client) => hrGetPayPeriod({ client, path }).unwrap()),
    loadPayroll((client) => hrGetPayPeriodSummary({ client, path }).unwrap()),
  ]);
  if (summary.state === "mfa" || detail.state === "mfa") {
    return (
      <PayrollMfaRequired securityUrl={securityUrl} what="The pay summary" />
    );
  }
  if (summary.state !== "ready" || detail.state !== "ready") {
    return <PayrollNoAccess what="Pay summary and issue approval" />;
  }
  return (
    <PayPeriodIssueView
      canApprove={access.canApprove}
      canReadAmounts={access.canReadAmounts}
      periodId={periodId}
      preparedByCaller={detail.data.prepared_by_caller}
      securityUrl={securityUrl}
      status={detail.data.period.status}
      summary={summary.data}
    />
  );
}
