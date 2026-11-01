import type {
  EmployeeBasicPayPublic,
  EmployeePayProfilePublic,
  PayItemPublic,
  PayItemRatePublic,
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
import { BasicPayForm, type EmployeeOption } from "./basic-pay-form";
import { ItemRateForm, type PayItemOption } from "./item-rate-form";

export interface PayRatesData {
  basicPay: PayrollLoad<{ data: EmployeeBasicPayPublic[] }>;
  items: PayrollLoad<{ data: PayItemPublic[] }>;
  profiles: PayrollLoad<{ data: EmployeePayProfilePublic[] }>;
  rates: PayrollLoad<{ data: PayItemRatePublic[] }>;
}

function rateText(rate: PayItemRatePublic): string {
  if (rate.rate_kind === "HOURLY_MULTIPLIER") {
    return `${rate.multiplier ?? "?"} times the hourly rate`;
  }
  const base = formatMoney(rate.amount_minor, rate.currency);
  if (rate.guaranteed_hours) {
    return `${base}, guaranteed ${rate.guaranteed_hours} h at ${rate.guaranteed_multiplier ?? "?"} times`;
  }
  return base;
}

function endText(date: string | null): string {
  return date ? ` to ${formatDay(date)}` : " onwards";
}

function BasicPayTable({ rows }: { rows: EmployeeBasicPayPublic[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Paid as</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Standard hours</TableHead>
            <TableHead>Dates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.employee_name}</TableCell>
              <TableCell>
                {row.pay_basis === "SALARIED"
                  ? "Salary, per month"
                  : "Hourly rate"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.amount_minor, row.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.standard_monthly_hours}
              </TableCell>
              <TableCell>
                {formatDay(row.effective_from)}
                {endText(row.effective_to)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RatesTable({
  items,
  rows,
}: {
  items: PayItemPublic[];
  rows: PayItemRatePublic[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pay item</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((rate) => (
            <TableRow key={rate.id}>
              <TableCell>
                {items.find((item) => item.id === rate.pay_item_id)?.name ??
                  "Pay item"}
              </TableCell>
              <TableCell>{rateText(rate)}</TableCell>
              <TableCell>
                {formatDay(rate.effective_from)}
                {endText(rate.effective_to)}
              </TableCell>
              <TableCell>
                <RuleStateBadge state={rate.rule_state} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Basic pay and item rates. Amounts only reach people with the amount or rate permissions. */
export function PayRatesView({
  access,
  data,
  organisationId,
  securityUrl,
}: {
  access: PayrollAccess;
  data: PayRatesData;
  organisationId: string;
  securityUrl: string;
}) {
  const canSeeMoney = access.canReadAmounts || access.canManageRates;
  if (!canSeeMoney) {
    return <PayrollNoAccess what="Pay rates and basic pay" />;
  }
  const employees: EmployeeOption[] =
    data.profiles.state === "ready"
      ? data.profiles.data.data.map((person) => ({
          user_id: person.user_id,
          name: person.employee_name,
        }))
      : [];
  const items: PayItemOption[] =
    data.items.state === "ready"
      ? data.items.data.data
          .filter((item) => item.is_active)
          .map((item) => ({
            id: item.id,
            name: item.name,
            rule_state: item.rule_state,
          }))
      : [];
  const itemNames: PayItemPublic[] =
    data.items.state === "ready" ? data.items.data.data : [];

  return (
    <div className="space-y-8">
      <section aria-label="Basic pay" className="space-y-4">
        <h2 className="font-semibold text-lg">Basic pay</h2>
        <BasicPaySection data={data} securityUrl={securityUrl} />
        {access.canManageRates && data.profiles.state === "ready" ? (
          <BasicPayForm
            employees={employees}
            organisationId={organisationId}
            securityUrl={securityUrl}
          />
        ) : null}
        {access.canManageRates && data.profiles.state !== "ready" ? (
          <PayrollNoAccess what="the employee list needed to set pay" />
        ) : null}
      </section>

      <section aria-label="Item rates" className="space-y-4">
        <h2 className="font-semibold text-lg">Item rates</h2>
        <p className="text-muted-foreground text-sm">
          Rates marked PROVISIONAL are not confirmed in writing yet. Their
          figures can be previewed but not issued.
        </p>
        <RatesSection
          data={data}
          itemNames={itemNames}
          securityUrl={securityUrl}
        />
        {access.canManageRates && data.items.state === "ready" ? (
          <ItemRateForm items={items} securityUrl={securityUrl} />
        ) : null}
      </section>
    </div>
  );
}

function BasicPaySection({
  data,
  securityUrl,
}: {
  data: PayRatesData;
  securityUrl: string;
}) {
  if (data.basicPay.state === "mfa") {
    return <PayrollMfaRequired securityUrl={securityUrl} what="Basic pay" />;
  }
  if (data.basicPay.state !== "ready") {
    return <PayrollNoAccess what="Basic pay" />;
  }
  if (data.basicPay.data.data.length === 0) {
    return <PayrollEmpty>No basic pay recorded yet.</PayrollEmpty>;
  }
  return <BasicPayTable rows={data.basicPay.data.data} />;
}

function RatesSection({
  data,
  itemNames,
  securityUrl,
}: {
  data: PayRatesData;
  itemNames: PayItemPublic[];
  securityUrl: string;
}) {
  if (data.rates.state === "mfa") {
    return <PayrollMfaRequired securityUrl={securityUrl} what="Item rates" />;
  }
  if (data.rates.state !== "ready") {
    return <PayrollNoAccess what="Item rates" />;
  }
  if (data.rates.data.data.length === 0) {
    return <PayrollEmpty>No item rates recorded yet.</PayrollEmpty>;
  }
  return <RatesTable items={itemNames} rows={data.rates.data.data} />;
}
