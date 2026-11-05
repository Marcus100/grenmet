"use client";

import {
  hrGetMyLeaveRequestsQueryKey,
  useHrDeleteLeaveRequest,
  useHrGetMyLeaveRequests,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RecordHistoryButton } from "@/components/audit/record-history";
import {
  isEditableStatus,
  RequestStatusBadge,
  ReturnedReason,
} from "@/components/hr/request-status";
import { formatSubmissionDate } from "@/components/hr/submission-date";

export function LeaveSubmissions() {
  const query = useHrGetMyLeaveRequests({});
  const queryClient = useQueryClient();
  const deleteMutation = useHrDeleteLeaveRequest();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requests = query.data?.data ?? [];

  async function remove(id: string) {
    setPendingId(id);
    try {
      await deleteMutation.mutateAsync({ path: { leave_request_id: id } });
      await queryClient.invalidateQueries({
        queryKey: hrGetMyLeaveRequestsQueryKey({}),
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
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-lg font-medium">My leave requests</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 pr-3 font-medium">From</th>
              <th className="py-1.5 pr-3 font-medium">To</th>
              <th className="py-1.5 pr-3 font-medium">Days</th>
              <th className="py-1.5 pr-3 font-medium">Date submitted</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const isDraft = request.status === "DRAFT";
              const canEdit = isEditableStatus(request.status);
              return (
                <tr className="border-border border-t" key={request.id}>
                  <td className="py-1.5 pr-3">{request.leave_type}</td>
                  <td className="py-1.5 pr-3">{request.start_date}</td>
                  <td className="py-1.5 pr-3">{request.end_date}</td>
                  <td className="py-1.5 pr-3">
                    {request.days_requested ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {formatSubmissionDate(request)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <RequestStatusBadge status={request.status} />
                    <ReturnedReason
                      reason={request.returned_reason}
                      status={request.status}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    {canEdit ? (
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
                        {isDraft && (
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
                        )}
                      </div>
                    ) : (
                      <RecordHistoryButton
                        entityId={request.id}
                        entityType="leave_request"
                        title="Leave request history"
                      />
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
