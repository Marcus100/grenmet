"use client";

import {
  type ClockPunchesPublic,
  type ClockPunchPendingPublic,
  clockPunchKind,
  hrGetAttendanceReviewQueryKey,
  hrGetAttendanceWeekQueryKey,
  hrGetInboxQueryKey,
  hrListPendingClockPunchesQueryKey,
  useAuthGetEffectiveAccess,
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
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";

const PAGE_SIZE = 50;
const EXPECTED_REVIEW_STATUSES = [403, 404, 409];
const TRAILING_DOT = /\.$/;

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error)
    return typeof error.status === "number" ? error.status : undefined;
  return undefined;
}

type Decision = "approve" | "reject";

/** Plain-language message for a failed review; 409 keeps the API's reason. */
export function punchReviewError(error: unknown): string {
  const status = errorStatus(error);
  if (status === 403)
    return "You cannot review this punch. You cannot review your own punch, and reviewers need the timesheet approval permission or must be the employee's named supervisor.";
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

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
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
  busy: Decision | undefined;
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
          Shift {punch.shift_code} on {dateLabel(punch.shift_date)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          aria-label={`Reject ${punch.employee_name} ${kindLabel(punch)}`}
          className="min-h-11 flex-1 sm:min-h-0 sm:flex-none"
          disabled={busy !== undefined}
          onClick={onReject}
          type="button"
          variant="outline"
        >
          {busy === "reject" ? (
            <Spinner className="size-4" data-icon="inline-start" />
          ) : (
            <X data-icon="inline-start" />
          )}
          Reject
        </Button>
        <Button
          aria-label={`Approve ${punch.employee_name} ${kindLabel(punch)}`}
          className="min-h-11 flex-1 sm:min-h-0 sm:flex-none"
          disabled={busy !== undefined}
          onClick={onApprove}
          type="button"
        >
          {busy === "approve" ? (
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
  const accessQuery = useAuthGetEffectiveAccess();
  // Server-authoritative: the API re-checks on every call. This only avoids
  // firing a request that is certain to be denied.
  const canReview =
    accessQuery.isError ||
    accessQuery.data?.is_superuser === true ||
    accessQuery.data?.permission_keys.includes("timesheet.approve") === true;
  const accessKnown = !accessQuery.isLoading;
  const listQuery = useHrListPendingClockPunches(
    { query },
    { query: { enabled: accessKnown && canReview } }
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const approve = useHrApproveClockPunch();
  const reject = useHrRejectClockPunch();
  const [busy, setBusy] = useState<Record<string, Decision>>({});
  const [rejecting, setRejecting] = useState<ClockPunchPendingPublic>();
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string>();

  useEffect(() => {
    if (listQuery.error && errorStatus(listQuery.error) !== 403)
      reportError(listQuery.error, "hr-punch-approvals");
  }, [listQuery.error]);

  // After the last row of a later page is decided the refetch can land past
  // the end; step back to the last page that still has rows.
  const listedCount = listQuery.data?.count;
  useEffect(() => {
    if (listedCount !== undefined && offset > 0 && offset >= listedCount)
      setOffset(
        Math.max(0, Math.floor((listedCount - 1) / PAGE_SIZE) * PAGE_SIZE)
      );
  }, [listedCount, offset]);

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
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [{ url: "/api/v1/hr/attendance/clock-punches/pending" }],
      }),
      queryClient.invalidateQueries({
        queryKey: hrGetInboxQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: [hrGetAttendanceReviewQueryKey()[0]],
      }),
      queryClient.invalidateQueries({
        queryKey: [hrGetAttendanceWeekQueryKey({ query: { day: "" } })[0]],
      }),
    ]);
  }

  async function decide(
    punch: ClockPunchPendingPublic,
    decision: Decision,
    run: () => Promise<unknown>,
    done: string
  ): Promise<boolean> {
    setBusy((current) => ({ ...current, [punch.id]: decision }));
    try {
      await run();
      removeFromList(punch.id);
      toast.success(done);
      await refresh();
      headingRef.current?.focus();
      return true;
    } catch (error) {
      if (!EXPECTED_REVIEW_STATUSES.includes(errorStatus(error) ?? 0))
        reportError(error, "hr-punch-review");
      toast.error(punchReviewError(error));
      if (errorStatus(error) !== 403) await refresh();
      // Expected review outcomes are final for this punch; anything else
      // (server or network failure) is worth retrying from the same dialog.
      return EXPECTED_REVIEW_STATUSES.includes(errorStatus(error) ?? 0);
    } finally {
      setBusy((current) => {
        const { [punch.id]: _done, ...rest } = current;
        return rest;
      });
    }
  }

  function approvePunch(punch: ClockPunchPendingPublic) {
    decide(
      punch,
      "approve",
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
    const settled = await decide(
      punch,
      "reject",
      () =>
        reject.mutateAsync({
          path: { punch_id: punch.id },
          body: { reason: trimmed },
        }),
      `Rejected ${punch.employee_name}`
    );
    if (settled) closeDialog();
  }

  const punches = listQuery.data?.data ?? [];
  const total = listQuery.data?.count ?? 0;

  let content: ReactNode;
  if (accessKnown && !canReview) {
    content = (
      <p className="rounded-xl border bg-card p-4 text-muted-foreground text-sm">
        You do not review phone punches. Ask a supervisor with timesheet
        approval to review them.
      </p>
    );
  } else if (!accessKnown || listQuery.isLoading) {
    content = (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading phone punches…
      </div>
    );
  } else if (listQuery.isError) {
    content = (
      <p role="alert">
        {errorStatus(listQuery.error) === 403
          ? "You cannot review phone punches. Reviewers need the timesheet approval permission or must be the employee's named supervisor."
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
            busy={busy[punch.id]}
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
          className="font-semibold text-lg tracking-tight outline-none"
          id="phone-punches-heading"
          ref={headingRef}
          tabIndex={-1}
        >
          Phone punches
        </h2>
        <p className="text-muted-foreground text-sm">
          Arrivals and departures staff recorded from their phone. They count as
          attendance only once you approve them.
        </p>
      </div>
      {content}
      {total > PAGE_SIZE || offset > 0 ? (
        <div className="flex items-center justify-between text-sm">
          <Button
            className="min-h-11 sm:min-h-0"
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
            className="min-h-11 sm:min-h-0"
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
              autoFocus
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
              disabled={rejecting ? busy[rejecting.id] !== undefined : false}
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
