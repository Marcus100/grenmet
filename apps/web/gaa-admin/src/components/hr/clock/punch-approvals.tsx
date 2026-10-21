"use client";

import {
  type ClockPunchesPublic,
  type ClockPunchPendingPublic,
  clockPunchKind,
  hrListPendingClockPunchesQueryKey,
  useHrApproveClockPunch,
  useHrListPendingClockPunches,
  useHrRejectClockPunch,
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
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";

const PAGE_SIZE = 50;
const EXPECTED_REVIEW_STATUSES = [403, 404, 409];
const TRAILING_DOT = /\.$/;

function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

/** Plain-language message for a failed review; 409 keeps the API's reason. */
export function punchReviewError(error: unknown): string {
  const status = errorStatus(error);
  if (status === 403)
    return "You cannot review this punch. Only the employee's supervisor, or someone who can approve timesheets for the department, can.";
  if (status === 404)
    return "This punch no longer exists. The list has been refreshed.";
  if (status === 409)
    return `${hrApiErrorMessage(error).replace(TRAILING_DOT, "")}. The list has been refreshed.`;
  return "Could not save your decision. Try again.";
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Grenada",
  });
}

function kindLabel(punch: ClockPunchPendingPublic): string {
  return punch.kind === clockPunchKind.ARRIVE ? "arrival" : "departure";
}

function PunchCard({
  busy,
  onApprove,
  onReject,
  punch,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  punch: ClockPunchPendingPublic;
}) {
  const arrival = punch.kind === clockPunchKind.ARRIVE;
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {punch.employee_name}
          <Badge variant={arrival ? "secondary" : "outline"}>
            {arrival ? "Arrival" : "Departure"}
          </Badge>
        </p>
        <p className="text-muted-foreground">
          {timeLabel(punch.punched_at)} · {punch.site_name}
        </p>
        <p className="text-muted-foreground">
          Shift {punch.shift_code} on {punch.shift_date}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          aria-label={`Reject ${punch.employee_name} ${kindLabel(punch)}`}
          className="flex-1 sm:flex-none"
          disabled={busy}
          onClick={onReject}
          type="button"
          variant="outline"
        >
          <X data-icon="inline-start" />
          Reject
        </Button>
        <Button
          aria-label={`Approve ${punch.employee_name} ${kindLabel(punch)}`}
          className="flex-1 sm:flex-none"
          disabled={busy}
          onClick={onApprove}
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
    </li>
  );
}

export function PunchApprovals() {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const query = { limit: PAGE_SIZE, offset };
  const listQuery = useHrListPendingClockPunches({ query });
  const approve = useHrApproveClockPunch();
  const reject = useHrRejectClockPunch();
  const [busyId, setBusyId] = useState<string>();
  const [rejecting, setRejecting] = useState<ClockPunchPendingPublic>();
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string>();

  useEffect(() => {
    if (listQuery.error && errorStatus(listQuery.error) !== 403)
      reportError(listQuery.error, "hr-punch-approvals");
  }, [listQuery.error]);

  function removeFromList(id: string) {
    queryClient.setQueryData<ClockPunchesPublic>(
      hrListPendingClockPunchesQueryKey({ query }),
      (current) =>
        current
          ? {
              data: current.data.filter((item) => item.id !== id),
              count: Math.max(0, current.count - 1),
            }
          : current
    );
  }

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: [{ url: "/api/v1/hr/attendance/clock-punches/pending" }],
    });
  }

  async function decide(
    punch: ClockPunchPendingPublic,
    run: () => Promise<unknown>,
    done: string
  ): Promise<boolean> {
    setBusyId(punch.id);
    try {
      await run();
      removeFromList(punch.id);
      toast.success(done);
      await refresh();
      return true;
    } catch (error) {
      if (!EXPECTED_REVIEW_STATUSES.includes(errorStatus(error) ?? 0))
        reportError(error, "hr-punch-review");
      toast.error(punchReviewError(error));
      if (errorStatus(error) !== 403) await refresh();
      return false;
    } finally {
      setBusyId(undefined);
    }
  }

  function approvePunch(punch: ClockPunchPendingPublic) {
    decide(
      punch,
      () => approve.mutateAsync({ path: { punch_id: punch.id }, body: {} }),
      `Approved ${punch.employee_name}`
    );
  }

  function closeDialog() {
    setRejecting(undefined);
    setReason("");
    setDialogError(undefined);
  }

  async function confirmReject() {
    if (!rejecting) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setDialogError("Give a reason so the employee knows why.");
      return;
    }
    const punch = rejecting;
    await decide(
      punch,
      () =>
        reject.mutateAsync({
          path: { punch_id: punch.id },
          body: { reason: trimmed },
        }),
      `Rejected ${punch.employee_name}`
    );
    closeDialog();
  }

  const punches = listQuery.data?.data ?? [];
  const total = listQuery.data?.count ?? 0;

  let content: ReactNode;
  if (listQuery.isLoading) {
    content = (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading phone punches…
      </div>
    );
  } else if (listQuery.isError) {
    content = (
      <p role="alert">
        {errorStatus(listQuery.error) === 403
          ? "You cannot review phone punches. This needs the timesheet approval permission."
          : "Unable to load phone punches. Refresh to retry."}
      </p>
    );
  } else if (punches.length === 0) {
    content = (
      <Empty className="rounded-xl border bg-card">
        <EmptyHeader>
          <EmptyTitle>No phone punches waiting</EmptyTitle>
          <EmptyDescription>
            When staff in your team clock in or out from their phone, the punch
            appears here until you approve or reject it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <ul aria-label="Pending phone punches" className="space-y-3">
        {punches.map((punch) => (
          <PunchCard
            busy={busyId === punch.id}
            key={punch.id}
            onApprove={() => approvePunch(punch)}
            onReject={() => setRejecting(punch)}
            punch={punch}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="phone-punches-heading" className="space-y-3">
      <div>
        <h2
          className="font-semibold text-lg tracking-tight"
          id="phone-punches-heading"
        >
          Phone punches
        </h2>
        <p className="text-muted-foreground text-sm">
          Arrivals and departures staff recorded from their phone. They count as
          attendance only once you approve them.
        </p>
      </div>
      {content}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <Button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        open={Boolean(rejecting)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Reject this punch?</AlertDialogTitle>
          <AlertDialogDescription>
            {rejecting
              ? `${rejecting.employee_name}'s ${kindLabel(rejecting)} will not count as attendance.${
                  rejecting.kind === clockPunchKind.ARRIVE
                    ? " Rejecting an arrival also rejects its pending departure."
                    : ""
                }`
              : ""}
          </AlertDialogDescription>
          <Field data-invalid={dialogError ? true : undefined}>
            <FieldLabel htmlFor="punch-reject-reason">Reason</FieldLabel>
            <Textarea
              aria-invalid={dialogError ? true : undefined}
              id="punch-reject-reason"
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
                setDialogError(undefined);
              }}
              value={reason}
            />
            {dialogError ? (
              <p className="text-destructive text-sm" role="alert">
                {dialogError}
              </p>
            ) : null}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={busyId !== undefined}
              onClick={confirmReject}
              type="button"
              variant="destructive"
            >
              Reject punch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
