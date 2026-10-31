"use client";

import {
  hrGetInboxQueryKey,
  useHrGetInbox,
  useHrTakeAction,
  type WorkflowAction,
  type WorkflowInboxItem,
  type WorkflowType,
} from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button, buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CornerUpLeft, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { SwapRuleWarnings } from "./shift/swap-rule-warnings";
import { AttendanceReview } from "./timesheet/attendance-review";

function approvalActionLabel(purpose: string | undefined): string {
  if (purpose === "RECORDING") return "Mark recorded";
  if (purpose === "REVIEW") return "Complete review";
  return "Approve";
}

const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  LEAVE_REQUEST: "Leave request",
  SHIFT_SWAP: "Shift exchange",
  ABSENTEE_REPORT: "Absentee report",
  STATUS_REPORT: "Daily status",
  TIMESHEET: "Timesheet",
  PARKING_PERMIT: "Parking permit",
  PAYROLL_RUN: "Payroll inputs",
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
  const inboxQuery = useHrGetInbox();
  const actionMutation = useHrTakeAction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [returning, setReturning] = useState<WorkflowInboxItem | undefined>();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const items = inboxQuery.data?.data ?? [];

  async function act(
    instanceId: string,
    action: WorkflowAction,
    stepId?: string | null,
    comments?: string
  ): Promise<boolean> {
    setPendingId(instanceId);
    try {
      await actionMutation.mutateAsync({
        path: { instance_id: instanceId },
        body: { action, step_id: stepId, comments },
      });
      await queryClient.invalidateQueries({
        queryKey: hrGetInboxQueryKey(),
      });
      const doneLabel: Record<string, string> = {
        APPROVE: "Approved",
        REJECT: "Rejected",
        RETURN: "Returned",
      };
      toast.success(doneLabel[action] ?? "Done");
      return true;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Action failed: ${detail}`);
      return false;
    } finally {
      setPendingId(null);
    }
  }

  function closeReturnDialog() {
    setReturning(undefined);
    setReason("");
    setReasonError(undefined);
  }

  async function confirmReturn() {
    if (!returning) {
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Give a reason so the author knows what to change.");
      return;
    }
    const settled = await act(
      returning.instance_id,
      "RETURN",
      returning.step_id,
      trimmed
    );
    if (settled) {
      closeReturnDialog();
    }
  }

  if (inboxQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading your approvals…
      </div>
    );
  }

  if (inboxQuery.isError)
    return (
      <p role="alert">Unable to load your workflow tasks. Refresh to retry.</p>
    );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
        Nothing awaits your approval right now.
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl border bg-card"
      data-content-width="wide"
    >
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
              <TableRow key={item.step_id ?? item.instance_id}>
                <TableCell className="font-medium">
                  {WORKFLOW_TYPE_LABELS[item.workflow_type] ??
                    item.workflow_type}
                  {item.entity_type === "shift_swap" && (
                    <SwapRuleWarnings swapId={item.entity_id} />
                  )}
                  {(item.entity_type === "attendance" ||
                    item.entity_type === "attendance_correction") && (
                    <AttendanceReview
                      correction={item.entity_type === "attendance_correction"}
                      entityId={item.entity_id}
                    />
                  )}
                </TableCell>
                <TableCell>{item.requester_name ?? "—"}</TableCell>
                <TableCell>{formatDate(item.submitted_at)}</TableCell>
                <TableCell>
                  <Badge variant={item.step_is_named ? "secondary" : "outline"}>
                    {item.purpose === "RECORDING"
                      ? "Recording"
                      : (item.label ??
                        (item.step_is_named ? "Co-approver" : "Approver"))}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.entity_type === "pay_period" ? (
                    // Payroll needs two-step verification and its own checks,
                    // so it is approved on the pay period page.
                    <div className="flex justify-end">
                      <Link
                        className={buttonVariants({ size: "sm" })}
                        href={`/hr/payroll/${item.entity_id}`}
                      >
                        Open in payroll
                      </Link>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {item.purpose !== "RECORDING" &&
                        item.is_required !== false && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() => setReturning(item)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <CornerUpLeft data-icon="inline-start" />
                              Return
                            </Button>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                act(item.instance_id, "REJECT", item.step_id)
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <X data-icon="inline-start" />
                              Reject
                            </Button>
                          </>
                        )}
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(item.instance_id, "APPROVE", item.step_id)
                        }
                        size="sm"
                        type="button"
                      >
                        {busy ? (
                          <Spinner
                            className="size-4"
                            data-icon="inline-start"
                          />
                        ) : (
                          <Check data-icon="inline-start" />
                        )}
                        {approvalActionLabel(item.purpose)}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            closeReturnDialog();
          }
        }}
        open={Boolean(returning)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Return this request?</AlertDialogTitle>
          <AlertDialogDescription>
            {returning
              ? `${WORKFLOW_TYPE_LABELS[returning.workflow_type] ?? returning.workflow_type} from ${returning.requester_name ?? "the requester"} goes back to its author to edit and submit again. Approval then starts over. It is not rejected.`
              : ""}
          </AlertDialogDescription>
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor="return-reason">
              Reason for returning
            </FieldLabel>
            <Textarea
              aria-invalid={reasonError ? true : undefined}
              autoFocus
              id="return-reason"
              maxLength={1000}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
              value={reason}
            />
            {reasonError ? (
              <p className="text-destructive text-sm" role="alert">
                {reasonError}
              </p>
            ) : null}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={returning ? pendingId === returning.instance_id : false}
              onClick={confirmReturn}
              type="button"
            >
              Return to author
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
