"use client";

import { useHrGetMyTimesheets } from "@barrelsgd/api-client";
import { RequestStatusBadge } from "@/components/hr/request-status";
import { formatSubmissionDate } from "@/components/hr/submission-date";

export function TimesheetSubmissions() {
  const query = useHrGetMyTimesheets({});
  const timesheets = query.data?.data ?? [];

  if (query.isLoading || timesheets.length === 0) {
    return null;
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-lg font-medium">My time sheets</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1.5 pr-3 font-medium">From</th>
              <th className="py-1.5 pr-3 font-medium">To</th>
              <th className="py-1.5 pr-3 font-medium">Date submitted</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {timesheets.map((timesheet) => (
              <tr className="border-border border-t" key={timesheet.id}>
                <td className="py-1.5 pr-3">{timesheet.period_start}</td>
                <td className="py-1.5 pr-3">{timesheet.period_end}</td>
                <td className="py-1.5 pr-3">
                  {formatSubmissionDate(timesheet)}
                </td>
                <td className="py-1.5">
                  <RequestStatusBadge status={timesheet.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
