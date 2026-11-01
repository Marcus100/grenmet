import "server-only";
import { hrListPeriodPayslips } from "@barrelsgd/api-client";
import { loadPayroll } from "../load-payroll";
import type { PayrollAccess } from "../payroll-access";
import { PayrollNoAccess } from "../payroll-states";
import { PeriodPayslipList } from "./payslip-list";
import { PeriodExports } from "./period-exports";

/** The period's payslips and bank and GL files. Needs amount access and two-step verification. */
export async function PeriodPayslips({
  access,
  periodId,
  periodStart,
  securityUrl,
  status,
}: {
  access: PayrollAccess;
  periodId: string;
  periodStart: string;
  securityUrl: string;
  status: string;
}) {
  if (!access.canReadAmounts) {
    return <PayrollNoAccess what="Payslips for this period" />;
  }
  const payslips = await loadPayroll((client) =>
    hrListPeriodPayslips({ client, path: { period_id: periodId } }).unwrap()
  );
  const exportable = ["APPROVED", "EXPORTED", "CLOSED"].includes(status);
  return (
    <section aria-label="Payslips" className="space-y-6">
      <h2 className="font-semibold text-lg">Payslips</h2>
      <PeriodPayslipList payslips={payslips} securityUrl={securityUrl} />
      {access.canExport && exportable ? (
        <PeriodExports
          periodId={periodId}
          periodStart={periodStart}
          securityUrl={securityUrl}
        />
      ) : null}
    </section>
  );
}
