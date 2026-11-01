import type { Metadata } from "next";
import { Suspense } from "react";
import { PayrollSectionLinks } from "@/components/hr/payroll/payroll-section-links";
import { PayrollWorkspace } from "@/components/hr/payroll/payroll-workspace";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Payroll inputs",
  description: "Hours and counts per pay period for the payroll of record",
};

export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Hours and allowance counts from approved attendance, prepared by HR and approved by a second person before export."
        title="Payroll inputs"
      />
      <PayrollSectionLinks />
      <Suspense fallback={<p role="status">Loading payroll inputs…</p>}>
        <PayrollWorkspace />
      </Suspense>
    </div>
  );
}
