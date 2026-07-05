"use client";

import {
  readInboxApiV1HrWorkflowsInstancesInboxGetQueryKey,
  useReadInboxApiV1HrWorkflowsInstancesInboxGet,
  useTakeActionApiV1HrWorkflowsInstancesInstanceIdActionsPost,
  type WorkflowAction,
  type WorkflowType,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import { Spinner } from "@grenmet/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grenmet/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CornerUpLeft, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  LEAVE_REQUEST: "Leave request",
  SHIFT_SWAP: "Shift exchange",
  ABSENTEE_REPORT: "Absentee report",
  STATUS_REPORT: "Daily status",
  TIMESHEET: "Timesheet",
  PARKING_PERMIT: "Parking permit",
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function ApprovalsInbox() {
  const queryClient = useQueryClient();
  const inboxQuery = useReadInboxApiV1HrWorkflowsInstancesInboxGet();
  const actionMutation =
    useTakeActionApiV1HrWorkflowsInstancesInstanceIdActionsPost();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const items = inboxQuery.data?.data ?? [];

  async function act(instanceId: string, action: WorkflowAction) {
    setPendingId(instanceId);
    try {
      await actionMutation.mutateAsync({
        instance_id: instanceId,
        data: { action },
      });
      await queryClient.invalidateQueries({
        queryKey: readInboxApiV1HrWorkflowsInstancesInboxGetQueryKey(),
      });
      const doneLabel: Record<string, string> = {
        APPROVE: "Approved",
        REJECT: "Rejected",
        RETURN: "Returned",
      };
      toast.success(doneLabel[action] ?? "Done");
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Action failed: ${detail}`);
    } finally {
      setPendingId(null);
    }
  }

  if (inboxQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading your approvals…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
        Nothing awaits your approval right now.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Request</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Your role</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const busy = pendingId === item.instance_id;
            return (
              <TableRow key={item.instance_id}>
                <TableCell className="font-medium">
                  {WORKFLOW_TYPE_LABELS[item.workflow_type] ??
                    item.workflow_type}
                </TableCell>
                <TableCell>{item.requester_name ?? "—"}</TableCell>
                <TableCell>{formatDate(item.submitted_at)}</TableCell>
                <TableCell>
                  <Badge variant={item.step_is_named ? "secondary" : "outline"}>
                    {item.step_is_named ? "Co-approver" : "Approver"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => act(item.instance_id, "RETURN")}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <CornerUpLeft data-icon="inline-start" />
                      Return
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => act(item.instance_id, "REJECT")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X data-icon="inline-start" />
                      Reject
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => act(item.instance_id, "APPROVE")}
                      size="sm"
                      type="button"
                    >
                      {busy ? (
                        <Spinner className="size-4" data-icon="inline-start" />
                      ) : (
                        <Check data-icon="inline-start" />
                      )}
                      Approve
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
