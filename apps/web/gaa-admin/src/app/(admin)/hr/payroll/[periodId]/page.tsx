import { hrGetPayPeriod } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import Link from "next/link";
import {
  loadEffectiveAccess,
  loadPayroll,
  payrollSecurityUrl,
} from "@/components/hr/payroll/load-payroll";
import { PayPeriodDetail } from "@/components/hr/payroll/pay-period-detail";
import { PayPeriodIssue } from "@/components/hr/payroll/period/pay-period-issue";
import { PeriodPayslips } from "@/components/hr/payroll/period/period-payslips";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Pay period",
  description: "Payroll input quantities for one pay period",
};

interface PageProps {
  params: Promise<{ periodId: string }>;
}

export default async function PayPeriodPage({ params }: PageProps) {
  const { periodId } = await params;
  const { access } = await loadEffectiveAccess();
  const securityUrl = payrollSecurityUrl();
  const period = await loadPayroll((client) =>
    hrGetPayPeriod({ client, path: { period_id: periodId } }).unwrap()
  );
  const status = period.state === "ready" ? period.data.period.status : "OPEN";
  const start = period.state === "ready" ? period.data.period.start_date : "";
  return (
    <div className="space-y-6">
      <Link
        className="text-info text-sm underline-offset-4 hover:underline"
        href="/hr/payroll"
      >
        Back to payroll inputs
      </Link>
      <PageHeader
        description="Recompute, add call-outs, submit, approve, then export the CSV for HrPlus. Pay summary, issue approval and payslips appear below."
        title="Pay period"
      />
      <PayPeriodDetail periodId={periodId} />
      <PayPeriodIssue
        access={access}
        periodId={periodId}
        securityUrl={securityUrl}
      />
      <PeriodPayslips
        access={access}
        periodId={periodId}
        periodStart={start}
        securityUrl={securityUrl}
        status={status}
      />
    </div>
  );
}
