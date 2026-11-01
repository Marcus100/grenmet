import type { PayslipPublic, PayslipsPublic } from "@barrelsgd/api-client";
import type { PayrollLoad } from "../load-payroll";
import { formatDay } from "../payroll-format";
import { formatMoney } from "../payroll-money";
import {
  PayrollEmpty,
  PayrollMfaRequired,
  PayrollNoAccess,
} from "../payroll-states";
import { PayslipDownload } from "./payslip-download";

export function PayslipTable({
  rows,
  securityUrl,
}: {
  rows: PayslipPublic[];
  securityUrl: string;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((slip) => (
        <li
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
          key={slip.id}
        >
          <div>
            <p className="font-medium">{slip.employee_name}</p>
            <p className="text-muted-foreground text-sm">
              Net {formatMoney(slip.net_minor, slip.currency)}, issued{" "}
              {formatDay(slip.issued_at)}
            </p>
          </div>
          <PayslipDownload
            filename={`payslip-${slip.employee_name.replaceAll(" ", "-").toLowerCase()}-${slip.period_start}.pdf`}
            payslipId={slip.id}
            securityUrl={securityUrl}
          />
        </li>
      ))}
    </ul>
  );
}

export function PeriodPayslipList({
  payslips,
  securityUrl,
}: {
  payslips: PayrollLoad<PayslipsPublic>;
  securityUrl: string;
}) {
  if (payslips.state === "mfa") {
    return <PayrollMfaRequired securityUrl={securityUrl} what="Payslips" />;
  }
  if (payslips.state !== "ready") {
    return <PayrollNoAccess what="Payslips for this period" />;
  }
  if (payslips.data.data.length === 0) {
    return (
      <PayrollEmpty>
        No payslips yet. They are created when the period is approved for issue.
      </PayrollEmpty>
    );
  }
  return <PayslipTable rows={payslips.data.data} securityUrl={securityUrl} />;
}
