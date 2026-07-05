"use client";

import { useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet } from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

export function LeaveSubmissions() {
  const query = useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet();
  const requests = query.data?.data ?? [];

  if (query.isLoading || requests.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">My leave requests</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 pr-3 font-medium">From</th>
              <th className="py-1.5 pr-3 font-medium">To</th>
              <th className="py-1.5 pr-3 font-medium">Days</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr className="border-border border-t" key={request.id}>
                <td className="py-1.5 pr-3">{request.leave_type}</td>
                <td className="py-1.5 pr-3">{request.start_date}</td>
                <td className="py-1.5 pr-3">{request.end_date}</td>
                <td className="py-1.5 pr-3">{request.days_requested ?? "—"}</td>
                <td className="py-1.5">
                  <Badge variant={STATUS_VARIANT[request.status] ?? "outline"}>
                    {request.status}
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
