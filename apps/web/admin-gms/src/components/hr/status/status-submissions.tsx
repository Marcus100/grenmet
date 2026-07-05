"use client";

import { useReadStatusReportsApiV1HrStatusReportsGet } from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

function yesNo(value: boolean | null | undefined) {
  if (value == null) {
    return "—";
  }
  return value ? "Yes" : "No";
}

/** Department status reports. The list endpoint needs the `status.report.read`
 *  permission, so it 403s for plain staff — render nothing in that case. */
export function StatusSubmissions() {
  const query = useReadStatusReportsApiV1HrStatusReportsGet();
  const reports = query.data?.data ?? [];

  if (query.isLoading || query.isError || reports.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">Submitted status reports</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Shift</th>
              <th className="py-1.5 pr-3 font-medium">Ops affected</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr className="border-border border-t" key={report.id}>
                <td className="py-1.5 pr-3">{report.report_date}</td>
                <td className="py-1.5 pr-3">
                  {report.shift_period ?? report.shift_code}
                </td>
                <td className="py-1.5 pr-3">
                  {yesNo(report.affected_operations)}
                </td>
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
