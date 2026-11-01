import type { PaySummaryPublic } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { formatDay } from "../payroll-format";
import { formatMoney } from "../payroll-money";
import { PayrollEmpty } from "../payroll-states";
import { IssueActions } from "./issue-actions";
import { type IssueBlocker, issueBlockers } from "./issue-blockers";

export const PROVISIONAL_BANNER = "Provisional figures: cannot be issued";

function ProvisionalBanner({ codes }: { codes: string[] }) {
  return (
    <div
      className="space-y-1 rounded-xl border border-warning p-4"
      role="alert"
    >
      <p className="font-semibold">{PROVISIONAL_BANNER}</p>
      <p className="text-sm">
        Provisional tables in these figures: {codes.join(", ")}. Their figures
        can be previewed here but not issued.
      </p>
    </div>
  );
}

function BlockerList({ blockers }: { blockers: IssueBlocker[] }) {
  if (blockers.length === 0) {
    return <p className="text-sm">Nothing is stopping issue approval.</p>;
  }
  return (
    <section aria-label="Why this cannot be issued" className="space-y-2">
      <h3 className="font-semibold text-base">Why this cannot be issued yet</h3>
      <ul className="space-y-2">
        {blockers.map((blocker) => (
          <li
            className="rounded-lg border bg-card p-3 text-sm"
            key={blocker.message}
          >
            <p className="font-medium">{blocker.message}</p>
            <p className="text-muted-foreground">
              Who can fix it: {blocker.whoCanFix}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pay summary preview, issue blockers and the approve and refresh actions. */
export function PayPeriodIssueView({
  canApprove,
  canReadAmounts,
  periodId,
  preparedByCaller,
  securityUrl,
  status,
  summary,
}: {
  canApprove: boolean;
  canReadAmounts: boolean;
  periodId: string;
  preparedByCaller: boolean;
  securityUrl: string;
  status: string;
  summary: PaySummaryPublic;
}) {
  const blockers = issueBlockers({
    status,
    preparedByCaller,
    canApprove,
    summary,
  });
  const locked = status === "APPROVED" || status === "EXPORTED";
  const issued = summary.issue_approved_at !== null;
  return (
    <section aria-label="Pay summary and issue" className="space-y-6">
      <h2 className="font-semibold text-lg">Pay summary and issue</h2>
      {summary.provisional_figures ? (
        <ProvisionalBanner codes={summary.blocking_tables} />
      ) : null}
      {issued ? (
        <p className="text-sm">
          Approved for issue on {formatDay(summary.issue_approved_at)}.
        </p>
      ) : null}
      {summary.employees.length === 0 ? (
        <PayrollEmpty>
          No pay lines to summarise yet. Recompute the period first.
        </PayrollEmpty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Employer</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.employees.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell className="font-medium">
                    {row.employee_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.gross_minor, summary.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(
                      row.employee_deductions_minor,
                      summary.currency
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(
                      row.employer_contributions_minor,
                      summary.currency
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.net_minor, summary.currency)}
                  </TableCell>
                  <TableCell>
                    {row.unpriced_line_count > 0 ? (
                      <Badge variant="light-error">
                        {row.unpriced_line_count} unpriced
                      </Badge>
                    ) : null}
                    {row.shortfall_minor > 0 ? (
                      <Badge variant="light-error">Short</Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {canReadAmounts ? <BlockerList blockers={blockers} /> : null}
      {canReadAmounts && locked && !issued ? (
        <IssueActions
          blockerCount={blockers.length}
          canApprove={canApprove}
          canRefresh={canApprove}
          periodId={periodId}
          securityUrl={securityUrl}
        />
      ) : null}
    </section>
  );
}
