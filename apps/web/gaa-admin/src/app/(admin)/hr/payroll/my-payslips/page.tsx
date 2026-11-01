import { hrListMyPayslips } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import {
  loadEffectiveAccess,
  loadPayroll,
  payrollSecurityUrl,
} from "@/components/hr/payroll/load-payroll";
import { PayrollSectionLinks } from "@/components/hr/payroll/payroll-section-links";
import { MyPayslipsView } from "@/components/hr/payroll/self/my-payslips-view";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "My payslips",
  description: "Your issued payslips",
};

export default async function MyPayslipsPage() {
  const { access } = await loadEffectiveAccess();
  const payslips = access.canReadSelf
    ? await loadPayroll((client) => hrListMyPayslips({ client }).unwrap())
    : { state: "forbidden" as const };
  return (
    <div className="space-y-6">
      <PayrollSectionLinks />
      <PageHeader
        description="Payslips issued to you. Downloading one needs two-step verification."
        title="My payslips"
      />
      <MyPayslipsView
        canReadSelf={access.canReadSelf}
        data={payslips}
        securityUrl={payrollSecurityUrl()}
      />
    </div>
  );
}
