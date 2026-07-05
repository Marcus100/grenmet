"use client";

import {
  readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey,
  useDeleteLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdDelete,
  useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet,
} from "@grenmet/api-client";
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

export function LeaveSubmissions() {
  const query = useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet();
  const queryClient = useQueryClient();
  const deleteMutation =
    useDeleteLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdDelete();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requests = query.data?.data ?? [];

  async function remove(id: string) {
    setPendingId(id);
    try {
      await deleteMutation.mutateAsync({ leave_request_id: id });
      await queryClient.invalidateQueries({
        queryKey: readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey(),
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
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const isDraft = request.status === "DRAFT";
              return (
                <tr className="border-border border-t" key={request.id}>
                  <td className="py-1.5 pr-3">{request.leave_type}</td>
                  <td className="py-1.5 pr-3">{request.start_date}</td>
                  <td className="py-1.5 pr-3">{request.end_date}</td>
                  <td className="py-1.5 pr-3">
                    {request.days_requested ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge
                      variant={STATUS_VARIANT[request.status] ?? "outline"}
                    >
                      {request.status}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right">
                    {isDraft ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          render={
                            <Link href={`/hr/leave?draft=${request.id}`} />
                          }
                          size="sm"
                          variant="ghost"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button
                          disabled={pendingId === request.id}
                          onClick={() => remove(request.id)}
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
