"use client";

import {
  type PayItemTotal,
  type PayLinePublic,
  type PayPeriodDetail as PayPeriodDetailData,
  type PayRunKind,
  useHrApprovePayPeriod,
  useHrClosePayPeriod,
  useHrComputePayPeriod,
  useHrDeletePayLine,
  useHrExportPayPeriodCsv,
  useHrGetPayPeriod,
  useHrListPayLines,
  useHrReturnPayPeriod,
  useHrSubmitPayPeriod,
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
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { reportError } from "@/lib/report-error";
import { ManualLineForm } from "./manual-line-form";
import {
  formatDay,
  formatQuantity,
  isPayrollQuery,
  LINE_KIND_LABEL,
  PERIOD_STATUS,
  periodLabel,
  RUN_LABEL,
} from "./payroll-format";

const RUNS: PayRunKind[] = ["REGULAR", "ADJUSTMENT"];

function ProvisionalBadge() {
  return <Badge variant="light-warning">Provisional</Badge>;
}

function saveCsv(filename: string, content: string) {
  if (typeof URL.createObjectURL !== "function") {
    return;
  }
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function TotalsTable({
  run,
  totals,
}: {
  run: PayRunKind;
  totals: PayItemTotal[];
}) {
  const rows = totals.filter((total) => total.run_kind === run);
  return (
    <section aria-label={RUN_LABEL[run]} className="space-y-2">
      <h3 className="font-semibold text-base">{RUN_LABEL[run]}</h3>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pay item</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={4}
                >
                  {run === "REGULAR"
                    ? "No quantities yet. Recompute after attendance is approved."
                    : "No corrections to earlier periods."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((total) => (
                <TableRow key={`${total.run_kind}-${total.pay_item_id}`}>
                  <TableCell>
                    <span className="font-medium">{total.name}</span>{" "}
                    <span className="font-mono text-muted-foreground text-xs">
                      {total.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {total.rule_state === "PROVISIONAL" ? (
                      <ProvisionalBadge />
                    ) : (
                      <Badge variant="outline">Confirmed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.line_count}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(total.quantity, total.unit)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function LinesTable({
  canRemove,
  lines,
  onRemove,
}: {
  canRemove: boolean;
  lines: PayLinePublic[];
  onRemove: (line: PayLinePublic) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Pay item</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={7}
              >
                No pay lines in the departments you can see.
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <span className="font-medium">{line.employee_name}</span>
                  <span className="block font-mono text-muted-foreground text-xs">
                    {line.employee_number ?? "No employee number"}
                  </span>
                </TableCell>
                <TableCell>{formatDay(line.work_date)}</TableCell>
                <TableCell>
                  {line.pay_item_name}{" "}
                  {line.rule_state === "PROVISIONAL" && <ProvisionalBadge />}
                </TableCell>
                <TableCell>
                  {LINE_KIND_LABEL[line.line_kind]}
                  {line.run_kind === "ADJUSTMENT" && (
                    <span className="block text-muted-foreground text-xs">
                      Corrects an earlier period
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatQuantity(line.quantity, line.unit)}
                </TableCell>
                <TableCell className="max-w-64 truncate">
                  {line.reason ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canRemove && line.line_kind === "MANUAL" ? (
                    <Button
                      onClick={() => onRemove(line)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ActionBar({
  busy,
  detail,
  onAction,
  onReturn,
}: {
  busy: string | null;
  detail: PayPeriodDetailData;
  onAction: (action: string) => void;
  onReturn: () => void;
}) {
  const allowed = new Set(detail.allowed_actions);
  const buttons: [string, string, "default" | "outline"][] = [
    ["compute", "Recompute", "outline"],
    ["submit", "Submit for approval", "default"],
    ["approve", "Approve", "default"],
    ["export", "Export CSV", "default"],
    ["close", "Close period", "outline"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons
        .filter(([action]) => allowed.has(action))
        .map(([action, label, variant]) => (
          <Button
            disabled={busy !== null}
            key={action}
            onClick={() => onAction(action)}
            type="button"
            variant={variant}
          >
            {busy === action && (
              <Spinner className="size-4" data-icon="inline-start" />
            )}
            {label}
          </Button>
        ))}
      {allowed.has("return") && (
        <Button
          disabled={busy !== null}
          onClick={onReturn}
          type="button"
          variant="outline"
        >
          Return to preparer
        </Button>
      )}
      {detail.prepared_by_caller && detail.period.status === "IN_REVIEW" && (
        <p className="text-muted-foreground text-sm">
          You prepared this period, so someone else must approve it.
        </p>
      )}
    </div>
  );
}

export function PayPeriodDetail({ periodId }: { periodId: string }) {
  const queryClient = useQueryClient();
  const path = { period_id: periodId };
  const detailQuery = useHrGetPayPeriod({ path });
  const linesQuery = useHrListPayLines({ path, query: { limit: 500 } });
  const compute = useHrComputePayPeriod();
  const submit = useHrSubmitPayPeriod();
  const approve = useHrApprovePayPeriod();
  const returnPeriod = useHrReturnPayPeriod();
  const exportCsv = useHrExportPayPeriodCsv();
  const close = useHrClosePayPeriod();
  const removeLine = useHrDeletePayLine();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const error = detailQuery.error ?? linesQuery.error;
    if (error) {
      reportError(error, "hr-payroll-period");
    }
  }, [detailQuery.error, linesQuery.error]);

  async function run(action: string, work: () => Promise<unknown>) {
    setBusy(action);
    setProblem("");
    try {
      await work();
      await queryClient.invalidateQueries({
        predicate: (query) => isPayrollQuery(query.queryKey),
      });
      return true;
    } catch (error) {
      const message = hrApiErrorMessage(error);
      setProblem(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const detail = detailQuery.data;

  async function onAction(action: string) {
    const messages: Record<string, string> = {
      compute: "Recomputed from approved attendance",
      submit: "Submitted for approval",
      approve: "Approved and locked",
      export: "CSV exported",
      close: "Period closed",
    };
    const ok = await run(action, async () => {
      if (action === "compute") await compute.mutateAsync({ path });
      if (action === "submit") await submit.mutateAsync({ path });
      if (action === "approve") await approve.mutateAsync({ path, body: {} });
      if (action === "close") await close.mutateAsync({ path });
      if (action === "export" && detail) {
        const content = await exportCsv.mutateAsync({ path });
        saveCsv(
          `pay-inputs-${detail.period.organisation_id}-${detail.period.start_date}.csv`,
          String(content)
        );
      }
    });
    if (ok) {
      toast.success(messages[action] ?? "Done");
    }
  }

  async function confirmReturn() {
    const comments = reason.trim();
    if (comments.length < 3) {
      setProblem("Give the preparer a reason for returning this period.");
      return;
    }
    const ok = await run("return", () =>
      returnPeriod.mutateAsync({ path, body: { comments } })
    );
    if (ok) {
      setReturning(false);
      setReason("");
      toast.success("Returned to the preparer");
    }
  }

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading pay period…
      </div>
    );
  }
  if (detailQuery.isError || !detail) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm" role="alert">
        This pay period was not found, or you do not have payroll access to it.{" "}
        <Link className="text-info underline" href="/hr/payroll">
          Back to payroll inputs
        </Link>
      </p>
    );
  }

  const { period } = detail;
  const status = PERIOD_STATUS[period.status];
  const lines = linesQuery.data?.data ?? [];
  const canAdd = detail.allowed_actions.includes("add_line");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">{periodLabel(period)}</h2>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {period.calendar_name} · {detail.employee_count} employees ·{" "}
            {detail.line_count} lines · last computed{" "}
            {formatDay(period.computed_at)}
            {period.export_count > 0 &&
              ` · exported ${period.export_count} time${period.export_count === 1 ? "" : "s"}`}
          </p>
        </div>
        <ActionBar
          busy={busy}
          detail={detail}
          onAction={onAction}
          onReturn={() => setReturning(true)}
        />
      </div>

      {problem && (
        <p
          className="rounded-lg border border-destructive p-3 text-destructive text-sm"
          role="alert"
        >
          {problem}
        </p>
      )}

      {!detail.overtime_bands_available && (
        <p className="rounded-lg border bg-muted p-3 text-sm">
          Overtime bands are not computed yet: the roster rules that decide them
          are still being built. Enter approved overtime hours by hand against
          the overtime pay items, with a reason.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {RUNS.map((run) => (
          <TotalsTable key={run} run={run} totals={detail.totals} />
        ))}
      </div>

      {canAdd && (
        <ManualLineForm
          organisationId={period.organisation_id}
          periodId={period.id}
        />
      )}

      <section aria-label="Pay lines" className="space-y-2">
        <h3 className="font-semibold text-base">Pay lines</h3>
        {linesQuery.isPending ? (
          <p className="text-muted-foreground text-sm" role="status">
            Loading pay lines…
          </p>
        ) : (
          <LinesTable
            canRemove={canAdd}
            lines={lines}
            onRemove={(line) =>
              run("remove", () =>
                removeLine.mutateAsync({
                  path: { period_id: period.id, line_id: line.id },
                })
              )
            }
          />
        )}
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setReturning(false);
          }
        }}
        open={returning}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Return this pay period?</AlertDialogTitle>
          <AlertDialogDescription>
            The period reopens so the preparer can correct it and submit again.
          </AlertDialogDescription>
          <Field>
            <FieldLabel htmlFor="payroll-return-reason">
              Reason for returning
            </FieldLabel>
            <Textarea
              id="payroll-return-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={busy !== null}
              onClick={confirmReturn}
              type="button"
            >
              Return to preparer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
