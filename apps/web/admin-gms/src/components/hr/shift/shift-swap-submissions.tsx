"use client";

import {
  listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey,
  useDeleteShiftSwapApiV1HrShiftSwapsShiftSwapIdDelete,
  useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet,
  useListMyShiftSwapsApiV1HrShiftSwapsMeGet,
  useReadHrProfileMeApiV1HrProfileMeGet,
} from "@grenmet/api-client";
import { useSessionUser } from "@grenmet/auth";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

export function ShiftSwapSubmissions() {
  const query = useListMyShiftSwapsApiV1HrShiftSwapsMeGet();
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const deleteMutation = useDeleteShiftSwapApiV1HrShiftSwapsShiftSwapIdDelete();
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  async function remove(id: string) {
    setPendingId(id);
    try {
      await deleteMutation.mutateAsync({ shift_swap_id: id });
      await queryClient.invalidateQueries({
        queryKey: listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey(),
      });
      toast.success("Draft deleted");
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Delete failed: ${detail}`);
    } finally {
      setPendingId(null);
    }
  }

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
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {swaps.map((swap) => {
              const isOwnedDraft =
                swap.status === "DRAFT" &&
                swap.requesting_user_id === sessionUser.id;
              return (
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
                  <td className="py-1.5 pr-3">
                    <Badge variant={STATUS_VARIANT[swap.status] ?? "outline"}>
                      {swap.status}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right">
                    {isOwnedDraft ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          render={<Link href={`/hr/shift?draft=${swap.id}`} />}
                          size="sm"
                          variant="ghost"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button
                          disabled={pendingId === swap.id}
                          onClick={() => remove(swap.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
