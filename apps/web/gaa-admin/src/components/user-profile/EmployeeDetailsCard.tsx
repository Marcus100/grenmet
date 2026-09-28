import type { EmploymentPublic } from "@barrelsgd/api-client";

export function EmployeeDetailsCard({
  employment,
}: {
  employment: EmploymentPublic;
}) {
  const fields = [
    ["Department", employment.department?.name],
    ["Grade", employment.grade?.label ?? employment.position],
    ["Employee number", employment.employee_number],
    ["Employment type", employment.employment_type?.replaceAll("_", " ")],
    ["Start date", employment.start_date],
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
    <section className="space-y-4 rounded-2xl border border-border p-5 lg:p-6">
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
      <p className="text-muted-foreground text-sm">
        An administrator manages employment details in HR Setup. You can update
        your personal and contact information below. Recorded service and
        probation facts do not determine leave entitlement automatically.
      </p>
    </section>
  );
}
