import type {
  DeductionTypePublic,
  EmployeeDeductionPublic,
  SocialInsuranceSchemePublic,
  StatutoryTablesPublic,
  TaxTablePublic,
} from "@barrelsgd/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import type { PayrollLoad } from "../load-payroll";
import type { PayrollAccess } from "../payroll-access";
import { formatDay } from "../payroll-format";
import { formatMoney } from "../payroll-money";
import {
  PayrollEmpty,
  PayrollMfaRequired,
  PayrollNoAccess,
  RuleStateBadge,
} from "../payroll-states";
import {
  DeductionTypeForm,
  EmployeeDeductionForm,
  SocialInsuranceForm,
  TaxTableForm,
} from "./statutory-forms";
import { type TableKind, TableStateAction } from "./table-state-action";

export interface TablesData {
  enrolments: PayrollLoad<{ data: EmployeeDeductionPublic[] }>;
  people: Map<string, string>;
  tables: PayrollLoad<StatutoryTablesPublic>;
}

const NAME_NOT_AVAILABLE = "Name not available";

/** The display name the API gives; "Not recorded" when no user is linked. */
function who(name: string | null, userId: string | null): string {
  if (name) return name;
  return userId ? NAME_NOT_AVAILABLE : "Not recorded";
}

function Provenance({
  row,
}: {
  row: {
    created_by_name: string | null;
    created_by_user_id: string | null;
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    confirmed_by_user_id: string | null;
  };
}) {
  return (
    <span className="block text-muted-foreground text-xs">
      Created by {who(row.created_by_name, row.created_by_user_id)}
      {row.confirmed_by_user_id
        ? `, confirmed by ${who(row.confirmed_by_name, row.confirmed_by_user_id)} on ${formatDay(row.confirmed_at)}`
        : ", not confirmed"}
    </span>
  );
}

interface TableRowBase {
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  confirmed_by_user_id: string | null;
  created_by_name: string | null;
  created_by_user_id: string | null;
  id: string;
  name: string;
  rule_state: string;
}

function TableList<T extends TableRowBase>({
  canConfirm,
  kind,
  rows,
  securityUrl,
  describe,
}: {
  canConfirm: boolean;
  kind: TableKind;
  rows: T[];
  securityUrl: string;
  describe: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <PayrollEmpty>Nothing saved yet.</PayrollEmpty>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="space-y-2 rounded-xl border bg-card p-4" key={row.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            <RuleStateBadge state={row.rule_state} />
          </div>
          <p className="text-sm">{describe(row)}</p>
          <Provenance row={row} />
          {canConfirm ? (
            <TableStateAction
              kind={kind}
              securityUrl={securityUrl}
              tableId={row.id}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const TRAILING_ZEROS = /\.?0+$/;

function trimPercent(rate: string): string {
  return (Number(rate) * 100).toFixed(2).replace(TRAILING_ZEROS, "");
}

function taxSummary(table: TaxTablePublic): string {
  const allowance = `Annual allowance ${formatMoney(table.annual_allowance_minor)}`;
  const bands = [...(table.bands ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((band) => `${trimPercent(band.rate)}%`);
  return `${allowance}. Bands: ${bands.join(", ") || "none"}. From ${formatDay(table.effective_from)}.`;
}

function schemeSummary(scheme: SocialInsuranceSchemePublic): string {
  const employee = (Number(scheme.employee_rate) * 100).toFixed(2);
  const employer = (Number(scheme.employer_rate) * 100).toFixed(2);
  return `Employee ${employee}%, employer ${employer}%. Ceilings ${formatMoney(scheme.monthly_ceiling_minor)} a month, ${formatMoney(scheme.weekly_ceiling_minor)} a week. From ${formatDay(scheme.effective_from)}.`;
}

function typeSummary(type: DeductionTypePublic): string {
  const authorised = type.requires_authorisation
    ? "Needs the employee's authorisation first."
    : "No authorisation needed.";
  return `${type.kind.replaceAll("_", " ").toLowerCase()}. ${authorised} From ${formatDay(type.effective_from)}.`;
}

/** Tax, social insurance, deduction types and enrolments. Amounts need the amount or rate permissions. */
export function TablesView({
  access,
  data,
  employees,
  organisationId,
  securityUrl,
}: {
  access: PayrollAccess;
  data: TablesData;
  employees: { user_id: string; name: string }[];
  organisationId: string;
  securityUrl: string;
}) {
  if (!(access.canReadAmounts || access.canManageRates)) {
    return <PayrollNoAccess what="Tax tables and deductions" />;
  }
  if (data.tables.state === "mfa") {
    return (
      <PayrollMfaRequired
        securityUrl={securityUrl}
        what="Tax tables and deductions"
      />
    );
  }
  if (data.tables.state !== "ready") {
    return <PayrollNoAccess what="Tax tables and deductions" />;
  }
  const tables = data.tables.data;
  const types = tables.deduction_types;
  return (
    <div className="space-y-10">
      <section aria-label="Income tax tables" className="space-y-4">
        <h2 className="font-semibold text-lg">Income tax tables</h2>
        <TableList
          canConfirm={access.canConfirmTables}
          describe={taxSummary}
          kind="tax"
          rows={tables.tax_tables}
          securityUrl={securityUrl}
        />
        {access.canManageRates ? (
          <TaxTableForm
            organisationId={organisationId}
            securityUrl={securityUrl}
          />
        ) : null}
      </section>

      <section aria-label="Social insurance" className="space-y-4">
        <h2 className="font-semibold text-lg">Social insurance</h2>
        <TableList
          canConfirm={access.canConfirmTables}
          describe={schemeSummary}
          kind="social-insurance"
          rows={tables.social_insurance}
          securityUrl={securityUrl}
        />
        {access.canManageRates ? (
          <SocialInsuranceForm
            organisationId={organisationId}
            securityUrl={securityUrl}
          />
        ) : null}
      </section>

      <section aria-label="Deduction types" className="space-y-4">
        <h2 className="font-semibold text-lg">Deduction types</h2>
        <TableList
          canConfirm={access.canConfirmTables}
          describe={typeSummary}
          kind="deduction"
          rows={types}
          securityUrl={securityUrl}
        />
        {access.canManageRates ? (
          <DeductionTypeForm
            organisationId={organisationId}
            securityUrl={securityUrl}
          />
        ) : null}
      </section>

      <section aria-label="Enrolments" className="space-y-4">
        <h2 className="font-semibold text-lg">Employee deductions</h2>
        <EnrolmentSection
          data={data}
          securityUrl={securityUrl}
          typeNames={types}
        />
        {access.canManageRates ? (
          <EmployeeDeductionForm
            deductionTypes={types.map((t) => ({
              id: t.id,
              name: t.name,
              requires_authorisation: t.requires_authorisation,
            }))}
            employees={employees}
            organisationId={organisationId}
            securityUrl={securityUrl}
          />
        ) : null}
      </section>
    </div>
  );
}

function EnrolmentSection({
  data,
  securityUrl,
  typeNames,
}: {
  data: TablesData;
  securityUrl: string;
  typeNames: DeductionTypePublic[];
}) {
  if (data.enrolments.state === "mfa") {
    return (
      <PayrollMfaRequired
        securityUrl={securityUrl}
        what="Employee deductions"
      />
    );
  }
  if (data.enrolments.state !== "ready") {
    return <PayrollNoAccess what="Employee deductions" />;
  }
  return (
    <EnrolmentTable
      personName={(id) => data.people.get(id) ?? "Staff member"}
      rows={data.enrolments.data.data}
      typeName={(id) => typeNames.find((t) => t.id === id)?.name ?? "Deduction"}
    />
  );
}

function EnrolmentTable({
  rows,
  personName,
  typeName,
}: {
  rows: EmployeeDeductionPublic[];
  personName: (id: string) => string;
  typeName: (id: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <PayrollEmpty>No employees are enrolled in a deduction yet.</PayrollEmpty>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Deduction</TableHead>
            <TableHead>Authorisation</TableHead>
            <TableHead>Employee confirmation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{personName(row.user_id)}</TableCell>
              <TableCell>{typeName(row.deduction_type_id)}</TableCell>
              <TableCell>
                {row.authorised_at
                  ? `Authorised ${row.authorisation_reference ?? ""}`.trim()
                  : "Not authorised yet"}
              </TableCell>
              <TableCell>
                {row.employee_confirmed_at
                  ? `Confirmed on ${formatDay(row.employee_confirmed_at)}`
                  : "Waiting for the employee to confirm. Not deducted until they do."}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
