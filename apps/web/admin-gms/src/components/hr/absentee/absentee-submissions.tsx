"use client";

import { useReadAbsenteeReportsApiV1HrAbsenteeReportsGet } from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

export function AbsenteeSubmissions() {
  const query = useReadAbsenteeReportsApiV1HrAbsenteeReportsGet();
  const reports = query.data?.data ?? [];

  if (query.isLoading || reports.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">My absentee reports</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Reason</th>
              <th className="py-1.5 pr-3 font-medium">Notes</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr className="border-border border-t" key={report.id}>
                <td className="py-1.5 pr-3">{report.report_date}</td>
                <td className="py-1.5 pr-3">{report.reason}</td>
                <td className="py-1.5 pr-3">{report.notes || "—"}</td>
                <td className="py-1.5">
                  <Badge variant={STATUS_VARIANT[report.status] ?? "outline"}>
                    {report.status}
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
