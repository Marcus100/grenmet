import { hrGetPayrollExportSettings } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { ExportSettingsView } from "@/components/hr/payroll/export/export-settings-view";
import { loadPayroll } from "@/components/hr/payroll/load-payroll";
import { resolvePayrollScope } from "@/components/hr/payroll/payroll-scope";
import {
  PayrollChooseOrganisation,
  PayrollNoOrganisation,
} from "@/components/hr/payroll/payroll-scope-chooser";
import { PayrollSectionLinks } from "@/components/hr/payroll/payroll-section-links";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Bank and GL export",
  description: "Bank file columns and GL account codes for payroll exports",
};

interface PageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function ExportSettingsPage({ searchParams }: PageProps) {
  const { org } = await searchParams;
  const scope = await resolvePayrollScope(org);
  if (scope.state === "none") {
    return <PayrollNoOrganisation />;
  }
  if (scope.state === "choose") {
    return (
      <PayrollChooseOrganisation
        basePath="/hr/payroll/export-settings"
        organisations={scope.organisations}
      />
    );
  }
  const organisation_id = scope.organisationId;
  const settings = await loadPayroll((client) =>
    hrGetPayrollExportSettings({
      client,
      query: { organisation_id },
    }).unwrap()
  );
  return (
    <div className="space-y-6">
      <PayrollSectionLinks />
      <PageHeader
        description="The columns in the bank payment file and the account codes for the GL journal. Changing them needs two-step verification."
        title="Bank and GL export"
      />
      <ExportSettingsView
        access={scope.access}
        organisationId={organisation_id}
        securityUrl={scope.securityUrl}
        settings={settings}
      />
    </div>
  );
}
