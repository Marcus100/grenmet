"use client";

import {
  type TerminalAttentionOutcome,
  type TerminalPunchPublic,
  useHrListTerminalPunches,
  useHrReprocessTerminalPunches,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import {
  ATTENTION_HELP,
  ATTENTION_OUTCOMES,
  countsSummary,
  errorStatus,
  invalidateAfterTerminalChange,
  kindLabel,
  OUTCOME_LABELS,
  punchTime,
} from "./terminal-format";

export const ATTENTION_PAGE_SIZE = 50;

function outcomeVariant(punch: TerminalPunchPublic) {
  return punch.outcome === "REFUSED" ? "destructive" : "outline";
}

function PunchRow({ punch }: { punch: TerminalPunchPublic }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">
        {punchTime(punch.punched_at)}
      </TableCell>
      <TableCell className="max-w-48 break-words">
        {punch.employee_name ?? (
          <span className="text-muted-foreground">Not linked</span>
        )}
      </TableCell>
      <TableCell className="font-mono">{punch.device_user_id}</TableCell>
      <TableCell className="max-w-40 break-words">{punch.terminal}</TableCell>
      <TableCell>{kindLabel(punch)}</TableCell>
      <TableCell>
        <Badge variant={outcomeVariant(punch)}>
          {OUTCOME_LABELS[punch.outcome]}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-72 break-words">
        {punch.detail ?? ""}
      </TableCell>
    </TableRow>
  );
}

const COLUMNS = [
  "Time",
  "Employee",
  "Device ID",
  "Terminal",
  "Scan",
  "Outcome",
  "Detail",
];

function LoadingRows() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <TableRow key={row}>
          {COLUMNS.map((column) => (
            <TableCell key={column}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function TerminalAttention({
  departmentId,
  offset,
  onOffsetChange,
  onOutcomeChange,
  outcome,
}: {
  departmentId: string;
  offset: number;
  onOffsetChange: (offset: number) => void;
  onOutcomeChange: (outcome: TerminalAttentionOutcome | undefined) => void;
  outcome: TerminalAttentionOutcome | undefined;
}) {
  const queryClient = useQueryClient();
  const listQuery = useHrListTerminalPunches({
    query: {
      department_id: departmentId,
      limit: ATTENTION_PAGE_SIZE,
      offset,
      ...(outcome ? { outcome } : {}),
    },
  });
  const reprocess = useHrReprocessTerminalPunches();

  useEffect(() => {
    if (listQuery.error && errorStatus(listQuery.error) !== 403)
      reportError(listQuery.error, "hr-terminal-punches");
  }, [listQuery.error]);

  // A reprocess can empty a later page; step back to the last page with rows.
  const total = listQuery.data?.count;
  useEffect(() => {
    if (total !== undefined && offset > 0 && offset >= total)
      onOffsetChange(
        Math.max(
          0,
          Math.floor((total - 1) / ATTENTION_PAGE_SIZE) * ATTENTION_PAGE_SIZE
        )
      );
  }, [total, offset, onOffsetChange]);

  async function decideAgain() {
    try {
      const summary = await reprocess.mutateAsync({
        body: { department_id: departmentId },
      });
      const more =
        summary.remaining > 0
          ? ` ${summary.remaining} more are waiting: decide again to continue.`
          : "";
      toast.success(
        `Decided ${summary.processed} held ${summary.processed === 1 ? "punch" : "punches"}: ${countsSummary(summary.outcomes)}.${more}`
      );
      await invalidateAfterTerminalChange(queryClient);
    } catch (error) {
      if (errorStatus(error) !== 403)
        reportError(error, "hr-terminal-reprocess");
      toast.error(
        errorStatus(error) === 403
          ? "You cannot decide punches for this department."
          : "Held punches were not decided again. Try again."
      );
    }
  }

  const punches = listQuery.data?.data ?? [];
  const count = listQuery.data?.count ?? 0;

  let body: ReactNode;
  if (listQuery.isError) {
    body = (
      <p className="text-sm" role="alert">
        {errorStatus(listQuery.error) === 403
          ? "You cannot see terminal punches for this department. You need roster management in it."
          : "Unable to load terminal punches. Refresh to retry."}
      </p>
    );
  } else if (!listQuery.isLoading && punches.length === 0) {
    body = (
      <Empty className="bg-card rounded-xl border">
        <EmptyHeader>
          <EmptyTitle>Nothing needs attention</EmptyTitle>
          <EmptyDescription>
            {outcome
              ? `No punches with the outcome “${OUTCOME_LABELS[outcome]}”.`
              : "Every imported punch was recorded or ignored as a repeat. Punches the import cannot place appear here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <LoadingRows />
            ) : (
              punches.map((punch) => <PunchRow key={punch.id} punch={punch} />)
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <section aria-labelledby="terminal-attention-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            id="terminal-attention-heading"
          >
            Punches that need attention
          </h2>
          <p className="text-muted-foreground text-sm">
            Oldest first. After you link a device ID, fix the roster or get the
            right permission, press Decide again: every punch listed here is
            decided again.
          </p>
        </div>
        <Button
          disabled={reprocess.isPending}
          onClick={decideAgain}
          type="button"
          variant="outline"
        >
          {reprocess.isPending ? (
            <Spinner className="size-4" data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          Decide again
        </Button>
      </div>
      <Field className="max-w-xs">
        <FieldLabel htmlFor="terminal-outcome">Outcome</FieldLabel>
        <NativeSelect
          id="terminal-outcome"
          onChange={(event) =>
            onOutcomeChange(
              ATTENTION_OUTCOMES.find((value) => value === event.target.value)
            )
          }
          value={outcome ?? ""}
        >
          <option value="">All that need attention</option>
          {ATTENTION_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {OUTCOME_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {outcome ? (
        <p className="text-muted-foreground text-sm">
          {ATTENTION_HELP[outcome]}
        </p>
      ) : null}
      {body}
      {count > ATTENTION_PAGE_SIZE || offset > 0 ? (
        <div className="flex items-center justify-between text-sm">
          <Button
            disabled={offset === 0}
            onClick={() =>
              onOffsetChange(Math.max(0, offset - ATTENTION_PAGE_SIZE))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {Math.min(offset + 1, count)}–
            {Math.min(offset + ATTENTION_PAGE_SIZE, count)} of {count}
          </span>
          <Button
            disabled={offset + ATTENTION_PAGE_SIZE >= count}
            onClick={() => onOffsetChange(offset + ATTENTION_PAGE_SIZE)}
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
