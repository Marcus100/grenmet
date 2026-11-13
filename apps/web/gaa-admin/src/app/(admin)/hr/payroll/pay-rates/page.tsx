import {
  hrListEmployeeBasicPay,
  hrListEmployeePayProfiles,
  hrListPayItemRates,
  hrListPayItems,
} from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { loadPayroll } from "@/components/hr/payroll/load-payroll";
import { resolvePayrollScope } from "@/components/hr/payroll/payroll-scope";
import {
  PayrollChooseOrganisation,
  PayrollNoOrganisation,
} from "@/components/hr/payroll/payroll-scope-chooser";
import { PayrollSectionLinks } from "@/components/hr/payroll/payroll-section-links";
import { PayRatesView } from "@/components/hr/payroll/rates/pay-rates-view";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Pay rates",
  description: "Basic pay and item rates for payroll",
};

interface PageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function PayRatesPage({ searchParams }: PageProps) {
  const { org } = await searchParams;
  const scope = await resolvePayrollScope(org);
  if (scope.state === "none") {
    return <PayrollNoOrganisation />;
  }
  if (scope.state === "choose") {
    return (
      <PayrollChooseOrganisation
        basePath="/hr/payroll/pay-rates"
        organisations={scope.organisations}
      />
    );
  }
  const organisation_id = scope.organisationId;
  const [basicPay, rates, items, profiles] = await Promise.all([
    loadPayroll((client) =>
      hrListEmployeeBasicPay({ client, query: { organisation_id } }).unwrap()
    ),
    loadPayroll((client) =>
      hrListPayItemRates({ client, query: { organisation_id } }).unwrap()
    ),
    loadPayroll((client) =>
      hrListPayItems({ client, query: { organisation_id } }).unwrap()
    ),
    loadPayroll((client) =>
      hrListEmployeePayProfiles({
        client,
        query: { organisation_id, limit: 500 },
      }).unwrap()
    ),
  ]);
  return (
    <div className="space-y-6">
      <PayrollSectionLinks />
      <PageHeader
        description="Dated basic pay and item rates. Every change needs two-step verification. Rates start as PROVISIONAL until the organisation confirms them in writing."
        title="Pay rates"
      />
      <PayRatesView
        access={scope.access}
        data={{ basicPay, rates, items, profiles }}
        organisationId={organisation_id}
        securityUrl={scope.securityUrl}
      />
    </div>
  );
}
