import { hrListMyDeductions } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import {
  loadEffectiveAccess,
  loadPayroll,
  payrollSecurityUrl,
} from "@/components/hr/payroll/load-payroll";
import { MyDeductionsView } from "@/components/hr/payroll/self/my-deductions-view";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "My deductions",
  description: "Deductions set up for you, and confirming them",
};

export default async function MyDeductionsPage() {
  const { access } = await loadEffectiveAccess();
  const deductions = access.canReadSelf
    ? await loadPayroll((client) => hrListMyDeductions({ client }).unwrap())
    : { state: "forbidden" as const };
  return (
    <div className="space-y-6">
      <PageHeader
        description="Deductions HR has set up for you. Confirm each one. Nothing is taken until you have."
        title="My deductions"
      />
      <MyDeductionsView
        canReadSelf={access.canReadSelf}
        data={deductions}
        securityUrl={payrollSecurityUrl()}
      />
    </div>
  );
}
