"use client";

import {
  type EmployeePayProfilePublic,
  type PayCalendarPublic,
  type PayFrequency,
  type PayItemMethod,
  type PayPeriodPublic,
  useHrCreatePayCalendar,
  useHrCreatePayPeriod,
  useHrGetOrganisations,
  useHrListEmployeePayProfiles,
  useHrListPayCalendars,
  useHrListPayItems,
  useHrListPayPeriods,
  useHrListPayrollDepartmentSettings,
  useHrUpdateEmployeePayProfile,
  useHrUpdatePayrollDepartmentSetting,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { PageTabsList } from "@/components/layout/page-tabs";
import { reportError } from "@/lib/report-error";
import {
  dayAfter,
  formatDay,
  isPayrollQuery,
  nextMonthStart,
  PERIOD_STATUS,
  periodLabel,
} from "./payroll-format";

const METHOD_LABEL: Record<PayItemMethod, string> = {
  ATTENDANCE_BASE: "Hours from attendance",
  PUBLIC_HOLIDAY: "Hours on a public holiday",
  TIME_WINDOW: "Hours inside a time window",
  THRESHOLD_EVENT: "Count when a threshold is crossed",
  OVERTIME_BAND: "Overtime band (roster rules)",
  MANUAL: "Entered by hand",
};

function suggestStart(
  calendar: PayCalendarPublic | undefined,
  latest: PayPeriodPublic | undefined
): string {
  if (calendar?.frequency === "FORTNIGHTLY") {
    return latest ? dayAfter(latest.end_date) : (calendar.anchor_date ?? "");
  }
  return latest
    ? nextMonthStart(latest.start_date)
    : `${new Date().toISOString().slice(0, 7)}-01`;
}

function useRefreshPayroll() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => isPayrollQuery(query.queryKey),
    });
}

function NoAccess() {
  return (
    <p className="rounded-xl border bg-card p-6 text-sm" role="alert">
      You do not have payroll access in this organisation. Ask the owner to
      assign a payroll permission.
    </p>
  );
}

function CalendarForm({ organisationId }: { organisationId: string }) {
  const refresh = useRefreshPayroll();
  const departments = useHrListPayrollDepartmentSettings({
    query: { organisation_id: organisationId },
  });
  const create = useHrCreatePayCalendar();
  const [name, setName] = useState("Pay calendar (provisional)");
  const [department, setDepartment] = useState("");
  const [frequency, setFrequency] = useState<"" | PayFrequency>("");
  const [anchor, setAnchor] = useState("");
  const [problem, setProblem] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!department) {
      setProblem("Choose the department that approves payroll.");
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          organisation_id: organisationId,
          name,
          approval_department_id: department,
          frequency: frequency || null,
          anchor_date: anchor || null,
        },
      });
      await refresh();
      toast.success("Pay calendar created");
    } catch (error) {
      setProblem(hrApiErrorMessage(error));
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
      <Field>
        <FieldLabel htmlFor="payroll-calendar-name">Calendar name</FieldLabel>
        <Input
          className="w-64"
          id="payroll-calendar-name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="payroll-calendar-department">
          Approving department
        </FieldLabel>
        <NativeSelect
          id="payroll-calendar-department"
          onChange={(event) => setDepartment(event.target.value)}
          value={department}
        >
          <option value="">Choose…</option>
          {(departments.data?.data ?? []).map((row) => (
            <option key={row.department_id} value={row.department_id}>
              {row.department_name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="payroll-calendar-frequency">How often</FieldLabel>
        <NativeSelect
          id="payroll-calendar-frequency"
          onChange={(event) =>
            setFrequency(event.target.value as "" | PayFrequency)
          }
          value={frequency}
        >
          <option value="">Organisation default</option>
          <option value="FORTNIGHTLY">Fortnightly</option>
          <option value="MONTHLY">Calendar month</option>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="payroll-calendar-anchor">
          First day of a fortnight
        </FieldLabel>
        <Input
          className="w-40"
          id="payroll-calendar-anchor"
          onChange={(event) => setAnchor(event.target.value)}
          type="date"
          value={anchor}
        />
      </Field>
      <Button disabled={create.isPending} type="submit">
        Create calendar
      </Button>
      {problem && (
        <p className="w-full text-destructive text-sm" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}

function PeriodsPanel({ organisationId }: { organisationId: string }) {
  const refresh = useRefreshPayroll();
  const router = useRouter();
  const calendarsQuery = useHrListPayCalendars({
    query: { organisation_id: organisationId },
  });
  const periodsQuery = useHrListPayPeriods({
    query: { organisation_id: organisationId, limit: 100 },
  });
  const create = useHrCreatePayPeriod();
  const calendars = calendarsQuery.data?.data ?? [];
  const periods = periodsQuery.data?.data ?? [];
  const [calendarId, setCalendarId] = useState("");
  const [start, setStart] = useState("");
  const [problem, setProblem] = useState("");
  const chosenCalendar = calendarId || calendars[0]?.id || "";
  const calendar = calendars.find((row) => row.id === chosenCalendar);
  const fortnightly = calendar?.frequency === "FORTNIGHTLY";
  const latest = periods.find(
    (period) => period.calendar_id === chosenCalendar
  );
  const suggestedStart = suggestStart(calendar, latest);

  if (calendarsQuery.isError || periodsQuery.isError) {
    return <NoAccess />;
  }

  async function onOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem("");
    try {
      const period = await create.mutateAsync({
        body: {
          calendar_id: chosenCalendar,
          start_date: start || suggestedStart,
        },
      });
      await refresh();
      router.push(`/hr/payroll/${period.id}`);
    } catch (error) {
      setProblem(hrApiErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Pay calendars"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <h3 className="font-semibold text-base">Pay calendars</h3>
        {calendars.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">
              No pay calendar yet. A calendar sets how periods run (calendar
              month for now) and which department approves them.
            </p>
            <CalendarForm organisationId={organisationId} />
          </>
        ) : (
          <ul className="space-y-1 text-sm">
            {calendars.map((calendar) => (
              <li className="flex items-center gap-2" key={calendar.id}>
                <span className="font-medium">{calendar.name}</span>
                {calendar.is_default && (
                  <Badge variant="outline">Default</Badge>
                )}
                {calendar.rule_state === "PROVISIONAL" && (
                  <Badge variant="light-warning">Provisional</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {calendars.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4"
          onSubmit={onOpen}
        >
          <Field>
            <FieldLabel htmlFor="payroll-period-calendar">Calendar</FieldLabel>
            <NativeSelect
              id="payroll-period-calendar"
              onChange={(event) => setCalendarId(event.target.value)}
              value={chosenCalendar}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="payroll-period-start">First day</FieldLabel>
            <Input
              className="w-40"
              id="payroll-period-start"
              onChange={(event) => setStart(event.target.value)}
              type="date"
              value={start || suggestedStart}
            />
          </Field>
          <Button disabled={create.isPending} type="submit">
            Open period
          </Button>
          <p className="text-muted-foreground text-sm">
            {fortnightly
              ? "The period runs for 14 days."
              : "The period runs to the end of that month."}
          </p>
          {problem && (
            <p className="w-full text-destructive text-sm" role="alert">
              {problem}
            </p>
          )}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Calendar</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Exported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {periodsQuery.isPending
                    ? "Loading pay periods…"
                    : "No pay periods yet."}
                </TableCell>
              </TableRow>
            ) : (
              periods.map((period) => {
                const status = PERIOD_STATUS[period.status];
                return (
                  <TableRow key={period.id}>
                    <TableCell>
                      <Link
                        className="font-medium text-info underline-offset-4 hover:underline"
                        href={`/hr/payroll/${period.id}`}
                      >
                        {periodLabel(period)}
                      </Link>
                    </TableCell>
                    <TableCell>{period.calendar_name}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>{formatDay(period.approved_at)}</TableCell>
                    <TableCell>{formatDay(period.exported_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CataloguePanel({ organisationId }: { organisationId: string }) {
  const itemsQuery = useHrListPayItems({
    query: { organisation_id: organisationId },
  });
  if (itemsQuery.isError) {
    return <NoAccess />;
  }
  const items = itemsQuery.data?.data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        What payroll counts, as hours or counts. No rates or amounts are kept
        here. Items marked Provisional are not yet confirmed by the
        organisation.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pay item</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>How it is counted</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {itemsQuery.isPending
                    ? "Loading pay items…"
                    : "No pay items for this organisation yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-medium">{item.name}</span>{" "}
                    <span className="font-mono text-muted-foreground text-xs">
                      {item.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.unit === "HOURS" ? "Hours" : "Count"}
                  </TableCell>
                  <TableCell>{METHOD_LABEL[item.method]}</TableCell>
                  <TableCell>
                    {item.rule_state === "PROVISIONAL" ? (
                      <Badge variant="light-warning">Provisional</Badge>
                    ) : (
                      <Badge variant="outline">Confirmed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md text-muted-foreground text-xs">
                    {item.source_reference ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function shiftChoice(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "default";
}

function ProfileRow({
  organisationId,
  profile,
}: {
  organisationId: string;
  profile: EmployeePayProfilePublic;
}) {
  const refresh = useRefreshPayroll();
  const update = useHrUpdateEmployeePayProfile();
  const [shift, setShift] = useState(shiftChoice(profile.shift_worker));
  const [reference, setReference] = useState(profile.payroll_reference ?? "");

  async function save() {
    try {
      await update.mutateAsync({
        path: { user_id: profile.user_id },
        body: {
          organisation_id: organisationId,
          calendar_id: profile.calendar_id ?? null,
          shift_worker: shift === "default" ? null : shift === "yes",
          payroll_reference: reference.trim() || null,
        },
      });
      await refresh();
      toast.success("Pay profile saved");
    } catch (error) {
      toast.error(hrApiErrorMessage(error));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{profile.employee_name}</span>
        <span className="block font-mono text-muted-foreground text-xs">
          {profile.employee_number ?? "No employee number"}
        </span>
      </TableCell>
      <TableCell>
        <NativeSelect
          aria-label={`Shift worker: ${profile.employee_name}`}
          onChange={(event) => setShift(event.target.value)}
          value={shift}
        >
          <option value="default">
            Department default (
            {profile.effective_shift_worker ? "shift" : "non-shift"})
          </option>
          <option value="yes">Shift worker</option>
          <option value="no">Not a shift worker</option>
        </NativeSelect>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Payroll reference: ${profile.employee_name}`}
          className="w-36 font-mono"
          maxLength={50}
          onChange={(event) => setReference(event.target.value)}
          value={reference}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          disabled={update.isPending}
          onClick={save}
          size="sm"
          type="button"
          variant="outline"
        >
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProfilesPanel({ organisationId }: { organisationId: string }) {
  const refresh = useRefreshPayroll();
  const profilesQuery = useHrListEmployeePayProfiles({
    query: { organisation_id: organisationId, limit: 500 },
  });
  const departmentsQuery = useHrListPayrollDepartmentSettings({
    query: { organisation_id: organisationId },
  });
  const updateDepartment = useHrUpdatePayrollDepartmentSetting();
  if (profilesQuery.isError || departmentsQuery.isError) {
    return <NoAccess />;
  }
  const profiles = profilesQuery.data?.data ?? [];
  const departments = departmentsQuery.data?.data ?? [];

  async function toggle(departmentId: string, value: boolean) {
    try {
      await updateDepartment.mutateAsync({
        path: { department_id: departmentId },
        body: { shift_worker_default: value },
      });
      await refresh();
    } catch (error) {
      toast.error(hrApiErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <section aria-label="Department defaults" className="space-y-2">
        <h3 className="font-semibold text-base">Department defaults</h3>
        <p className="text-muted-foreground text-sm">
          Shift workers get a meal allowance after more than 2 hours past their
          8-hour shift; others when they leave after 18:30 (provisional rules).
        </p>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Staff are shift workers by default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={2}
                  >
                    No departments you can see.
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((row) => (
                  <TableRow key={row.department_id}>
                    <TableCell>{row.department_name}</TableCell>
                    <TableCell>
                      <input
                        aria-label={`${row.department_name} staff are shift workers`}
                        checked={row.shift_worker_default}
                        className="size-4 accent-primary"
                        onChange={(event) =>
                          toggle(row.department_id, event.target.checked)
                        }
                        type="checkbox"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      <section aria-label="Employees" className="space-y-2">
        <h3 className="font-semibold text-base">Employees</h3>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Shift worker</TableHead>
                <TableHead>Payroll reference</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={4}
                  >
                    {profilesQuery.isPending
                      ? "Loading employees…"
                      : "No employees you can see."}
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => (
                  <ProfileRow
                    key={profile.user_id}
                    organisationId={organisationId}
                    profile={profile}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

const TABS = ["periods", "items", "profiles"] as const;

export function PayrollWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const organisationsQuery = useHrGetOrganisations();
  const organisations = organisationsQuery.data ?? [];
  const requested = params.get("org") ?? "";
  const organisationId =
    requested ||
    (organisations.length === 1 ? (organisations[0]?.id ?? "") : "");
  const tabParam = params.get("tab");
  const tab = TABS.find((value) => value === tabParam) ?? "periods";

  useEffect(() => {
    if (organisationsQuery.error) {
      reportError(organisationsQuery.error, "hr-payroll-organisations");
    }
  }, [organisationsQuery.error]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  if (organisationsQuery.isPending) {
    return <p role="status">Loading organisations…</p>;
  }
  if (organisationsQuery.isError) {
    return <p role="alert">Unable to load organisations. Refresh to retry.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border bg-muted p-3 text-sm">
        Quantities only: hours and counts for the payroll system of record
        (HrPlus). Nothing here calculates pay, tax or deductions.
      </p>
      {organisations.length > 1 && (
        <Field className="max-w-xs">
          <FieldLabel htmlFor="payroll-organisation">Organisation</FieldLabel>
          <NativeSelect
            id="payroll-organisation"
            onChange={(event) => setParam("org", event.target.value)}
            value={organisationId}
          >
            <option value="">Choose…</option>
            {organisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {organisationId ? (
        <Tabs
          className="w-full flex-col gap-4"
          key={organisationId}
          onValueChange={(value) => setParam("tab", String(value))}
          value={tab}
        >
          <PageTabsList>
            <TabsTrigger value="periods">Pay periods</TabsTrigger>
            <TabsTrigger value="items">Pay items</TabsTrigger>
            <TabsTrigger value="profiles">Pay profiles</TabsTrigger>
          </PageTabsList>
          <TabsContent className="w-full min-w-0" value="periods">
            <PeriodsPanel organisationId={organisationId} />
          </TabsContent>
          <TabsContent className="w-full min-w-0" value="items">
            <CataloguePanel organisationId={organisationId} />
          </TabsContent>
          <TabsContent className="w-full min-w-0" value="profiles">
            <ProfilesPanel organisationId={organisationId} />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-muted-foreground text-sm">
          Choose an organisation to see its payroll inputs.
        </p>
      )}
    </div>
  );
}
