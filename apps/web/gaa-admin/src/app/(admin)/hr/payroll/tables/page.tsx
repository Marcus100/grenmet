import {
  hrListEmployeeDeductions,
  hrListEmployeePayProfiles,
  hrListStatutoryTables,
} from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { loadPayroll } from "@/components/hr/payroll/load-payroll";
import { resolvePayrollScope } from "@/components/hr/payroll/payroll-scope";
import {
  PayrollChooseOrganisation,
  PayrollNoOrganisation,
} from "@/components/hr/payroll/payroll-scope-chooser";
import { PayrollSectionLinks } from "@/components/hr/payroll/payroll-section-links";
import { TablesView } from "@/components/hr/payroll/tables/tables-view";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Tax and deductions",
  description: "Income tax, social insurance and deduction tables for payroll",
};

interface PageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function TablesPage({ searchParams }: PageProps) {
  const { org } = await searchParams;
  const scope = await resolvePayrollScope(org);
  if (scope.state === "none") {
    return <PayrollNoOrganisation />;
  }
  if (scope.state === "choose") {
    return (
      <PayrollChooseOrganisation
        basePath="/hr/payroll/tables"
        organisations={scope.organisations}
      />
    );
  }
  const organisation_id = scope.organisationId;
  const [tables, enrolments, profiles] = await Promise.all([
    loadPayroll((client) =>
      hrListStatutoryTables({ client, query: { organisation_id } }).unwrap()
    ),
    loadPayroll((client) =>
      hrListEmployeeDeductions({ client, query: { organisation_id } }).unwrap()
    ),
    loadPayroll((client) =>
      hrListEmployeePayProfiles({
        client,
        query: { organisation_id, limit: 500 },
      }).unwrap()
    ),
  ]);
  const people = new Map<string, string>();
  const employees: { user_id: string; name: string }[] = [];
  if (profiles.state === "ready") {
    for (const person of profiles.data.data) {
      people.set(person.user_id, person.employee_name);
      employees.push({ user_id: person.user_id, name: person.employee_name });
    }
  }
  return (
    <div className="space-y-6">
      <PayrollSectionLinks />
      <PageHeader
        description="Tables start as PROVISIONAL. Someone other than the creator confirms each one before its figures can be issued. Employees must confirm deductions that need their authorisation."
        title="Tax and deductions"
      />
      <TablesView
        access={scope.access}
        data={{ tables, enrolments, people }}
        employees={employees}
        organisationId={organisation_id}
        securityUrl={scope.securityUrl}
      />
    </div>
  );
}
