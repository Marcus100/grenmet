import type { PayslipsPublic } from "@barrelsgd/api-client";
import type { PayrollLoad } from "../load-payroll";
import {
  PayrollEmpty,
  PayrollMfaRequired,
  PayrollNoAccess,
} from "../payroll-states";
import { PayslipTable } from "../period/payslip-list";

/** The person's own issued payslips. Shows their net pay, which the self-service permission allows. */
export function MyPayslipsView({
  canReadSelf,
  data,
  securityUrl,
}: {
  canReadSelf: boolean;
  data: PayrollLoad<PayslipsPublic>;
  securityUrl: string;
}) {
  if (
    !canReadSelf ||
    data.state === "forbidden" ||
    data.state === "not_found"
  ) {
    return <PayrollNoAccess what="your payslips" />;
  }
  if (data.state === "mfa") {
    return (
      <PayrollMfaRequired securityUrl={securityUrl} what="Your payslips" />
    );
  }
  if (data.data.data.length === 0) {
    return (
      <PayrollEmpty>No payslips have been issued to you yet.</PayrollEmpty>
    );
  }
  return <PayslipTable rows={data.data.data} securityUrl={securityUrl} />;
}
