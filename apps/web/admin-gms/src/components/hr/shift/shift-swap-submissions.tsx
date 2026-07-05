"use client";

import {
  useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet,
  useListMyShiftSwapsApiV1HrShiftSwapsMeGet,
  useReadHrProfileMeApiV1HrProfileMeGet,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

export function ShiftSwapSubmissions() {
  const query = useListMyShiftSwapsApiV1HrShiftSwapsMeGet();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const membersQuery =
    useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet(
      departmentId ?? "",
      { query: { enabled: Boolean(departmentId) } }
    );
  const swaps = query.data?.data ?? [];
  const memberNames = new Map(
    (membersQuery.data?.data ?? []).map((member) => [
      member.user_id,
      `${member.first_name.charAt(0)}. ${member.last_name}`,
    ])
  );

  if (query.isLoading || swaps.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">My shift exchange requests</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Requested Shift</th>
              <th className="py-1.5 pr-3 font-medium">Return Shift</th>
              <th className="py-1.5 pr-3 font-medium">Counterpart</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {swaps.map((swap) => (
              <tr className="border-border border-t" key={swap.id}>
                <td className="py-1.5 pr-3">
                  {swap.source_date} — {swap.source_shift_code}
                </td>
                <td className="py-1.5 pr-3">
                  {swap.target_date} — {swap.target_shift_code}
                </td>
                <td className="py-1.5 pr-3">
                  {memberNames.get(swap.counterpart_user_id) ??
                    `${swap.counterpart_user_id.slice(0, 8)}…`}
                </td>
                <td className="py-1.5">
                  <Badge variant={STATUS_VARIANT[swap.status] ?? "outline"}>
                    {swap.status}
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
