import type { Metadata } from "next";
import Link from "next/link";
import { PayPeriodDetail } from "@/components/hr/payroll/pay-period-detail";
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
  return (
    <div className="space-y-6">
      <Link
        className="text-info text-sm underline-offset-4 hover:underline"
        href="/hr/payroll"
      >
        Back to payroll inputs
      </Link>
      <PageHeader
        description="Recompute, add call-outs, submit, approve, then export the CSV for HrPlus."
        title="Pay period"
      />
      <PayPeriodDetail periodId={periodId} />
    </div>
  );
}
