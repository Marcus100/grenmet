import type { MyDeductionPublic } from "@barrelsgd/api-client";
import type { PayrollLoad } from "../load-payroll";
import { formatDay } from "../payroll-format";
import {
  PayrollEmpty,
  PayrollMfaRequired,
  PayrollNoAccess,
} from "../payroll-states";
import { ConfirmDeductionButton } from "./confirm-deduction-button";

/** The employee's own deductions. No amounts: the list shows what was set up and whether they confirmed it. */
export function MyDeductionsView({
  canReadSelf,
  data,
  securityUrl,
}: {
  canReadSelf: boolean;
  data: PayrollLoad<{ data: MyDeductionPublic[] }>;
  securityUrl: string;
}) {
  if (!canReadSelf) {
    return <PayrollNoAccess what="your deductions" />;
  }
  if (data.state === "mfa") {
    return (
      <PayrollMfaRequired securityUrl={securityUrl} what="Your deductions" />
    );
  }
  if (data.state !== "ready") {
    return <PayrollNoAccess what="your deductions" />;
  }
  if (data.data.data.length === 0) {
    return <PayrollEmpty>No deductions are set up for you.</PayrollEmpty>;
  }
  return (
    <ul className="space-y-3">
      {data.data.data.map((item) => (
        <li className="space-y-2 rounded-xl border bg-card p-4" key={item.id}>
          <p className="font-medium">{item.deduction_name}</p>
          <p className="text-muted-foreground text-sm">
            From {formatDay(item.effective_from)}
            {item.effective_to ? ` to ${formatDay(item.effective_to)}` : ""}
          </p>
          {item.employee_confirmed_at ? (
            <p className="text-sm">
              You confirmed this on {formatDay(item.employee_confirmed_at)}.
            </p>
          ) : (
            <>
              <p className="text-sm">
                Please confirm this deduction. It is not taken from your pay
                until you do.
              </p>
              <ConfirmDeductionButton deductionId={item.id} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
