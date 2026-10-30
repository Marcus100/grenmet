import type { EmploymentPublic } from "@barrelsgd/api-client";
import { grenadaToday } from "@/components/hr/expiry";
import { endDateState, formatLastDay } from "@/lib/employment-end";

export function EmployeeDetailsCard({
  employment,
}: {
  employment: EmploymentPublic;
}) {
  const lastDay = employment.end_date ?? null;
  const lastDayState = endDateState(lastDay, grenadaToday());
  const fields = [
    ["Department", employment.department?.name],
    ["Grade", employment.grade?.label ?? employment.position],
    ["Employee number", employment.employee_number],
    ["Employment type", employment.employment_type?.replaceAll("_", " ")],
    ["Start date", employment.start_date],
    ["Last day", lastDay ? formatLastDay(lastDay) : null],
    ["Verified continuous service date", employment.continuous_service_date],
    ["Recorded probation end date", employment.probation_end_date],
    ["Verified probation completion date", employment.probation_completed_date],
    [
      "HR source for service / probation facts",
      employment.service_details_source,
    ],
    ["Supervisor", employment.supervisor_name],
    ["Work location", employment.work_location],
    ["Employment status", employment.status],
  ];
  return (
    <section className="space-y-4 rounded-xl border border-border p-5 lg:p-6">
      <h2 className="font-semibold text-lg">Employment information</h2>
      {!employment.details_complete && (
        <p className="text-muted-foreground text-sm">
          Your department membership is recorded. Personnel details still need
          verification before HR requests can be submitted.
        </p>
      )}
      <dl className="grid gap-5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 text-sm">{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      {lastDay && lastDayState === "today" ? (
        <p className="text-sm">
          Last day is today. Access ends at midnight tonight.
        </p>
      ) : null}
      {lastDay && lastDayState === "passed" ? (
        <p className="text-sm">
          This last day has passed. Access ended at midnight after{" "}
          {formatLastDay(lastDay)}.
          {employment.status === "ACTIVE"
            ? " The nightly update then sets the status to Terminated."
            : ""}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        An administrator manages employment details in HR Setup. You can update
        your personal and contact information below. Recorded service and
        probation facts do not determine leave entitlement automatically.
      </p>
    </section>
  );
}
