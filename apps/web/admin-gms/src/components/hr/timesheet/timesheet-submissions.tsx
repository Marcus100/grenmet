"use client";

import { useReadMyTimesheetsApiV1HrTimesheetsMeGet } from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
};

export function TimesheetSubmissions() {
  const query = useReadMyTimesheetsApiV1HrTimesheetsMeGet();
  const timesheets = query.data?.data ?? [];

  if (query.isLoading || timesheets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">My time sheets</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">From</th>
              <th className="py-1.5 pr-3 font-medium">To</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {timesheets.map((timesheet) => (
              <tr className="border-border border-t" key={timesheet.id}>
                <td className="py-1.5 pr-3">{timesheet.period_start}</td>
                <td className="py-1.5 pr-3">{timesheet.period_end}</td>
                <td className="py-1.5">
                  <Badge
                    variant={STATUS_VARIANT[timesheet.status] ?? "outline"}
                  >
                    {timesheet.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
