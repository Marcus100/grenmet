import type {
  PaymentBalancePublic,
  PaymentLedgerEntryPublic,
  PaymentReconciliationPublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import Link from "next/link";
import { recordPayoutAction } from "@/app/(console)/payments/actions";
import { ConsolePager } from "@/components/console-pager";
import {
  formatXcd,
  LEDGER_KINDS,
  type PayoutInput,
  type Period,
} from "@/lib/payment-form";

const DATE_LENGTH = 10;

function OrgLink({ id }: { id: string }) {
  return (
    <Link
      className="font-mono underline"
      href={`/organisations/${encodeURIComponent(id)}`}
    >
      {id}
    </Link>
  );
}

export function TestModeBanner() {
  return (
    <p className="max-w-3xl rounded-md border px-3 py-2 text-sm" role="note">
      The Stripe adapter is test mode only and no live card rail is enabled.
      Nothing here moves real card money. Amounts are stored in minor units and
      shown as XCD with two decimals.
    </p>
  );
}

export function PaymentsHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 className="font-medium" id={id}>
      {title}
    </h2>
  );
}

export function BalancesPanel({ rows }: { rows: PaymentBalancePublic[] }) {
  return (
    <section aria-labelledby="balances-heading" className="space-y-2">
      <PaymentsHeading id="balances-heading" title="Balances owed" />
      {rows.length === 0 ? (
        <Empty className="p-4" role="status">
          <EmptyHeader>
            <EmptyTitle>No balances owed</EmptyTitle>
            <EmptyDescription>
              No organisation has a ledger balance yet. Balances appear once a
              booking deposit or event order is paid.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead className="text-right">Owed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.organisation_id}-${row.currency}`}>
                <TableCell>
                  <OrgLink id={row.organisation_id} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatXcd(row.owed_minor, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export function LedgerPanel({
  count,
  kind,
  lastPage,
  nextHref,
  organisationId,
  page,
  previousHref,
  rows,
}: {
  count: number;
  kind: string | undefined;
  lastPage: number;
  nextHref: string | undefined;
  organisationId: string | undefined;
  page: number;
  previousHref: string | undefined;
  rows: PaymentLedgerEntryPublic[];
}) {
  return (
    <section aria-labelledby="ledger-heading" className="space-y-2">
      <PaymentsHeading id="ledger-heading" title="Ledger" />
      <form
        action="/payments"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <label className="grid gap-1 text-sm">
          Organisation id
          <Input
            className="font-mono"
            defaultValue={organisationId ?? ""}
            maxLength={100}
            name="ledger_organisation_id"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Kind
          <NativeSelect defaultValue={kind ?? ""} name="kind">
            <option value="">Any</option>
            {LEDGER_KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline">
          Filter ledger
        </Button>
      </form>
      {rows.length === 0 ? (
        <Empty className="p-4" role="status">
          <EmptyHeader>
            <EmptyTitle>No ledger entries match</EmptyTitle>
            <EmptyDescription>
              Clear the organisation id or kind filter to see every entry.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.created_at.slice(0, DATE_LENGTH)}</TableCell>
                <TableCell>
                  <OrgLink id={row.organisation_id} />
                </TableCell>
                <TableCell>{row.kind}</TableCell>
                <TableCell>{row.provider}</TableCell>
                <TableCell className="break-all">
                  {ledgerReference(row)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatXcd(row.amount_minor, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {count > 0 ? (
        <ConsolePager
          count={count}
          label="Ledger pages"
          lastPage={lastPage}
          nextHref={nextHref}
          page={page}
          previousHref={previousHref}
        />
      ) : null}
    </section>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  "bookings.deposit": "Booking",
  "events.order": "Event order",
};

/**
 * What a ledger row is about: the label the selling domain gave the payment
 * (service and business), else the reference or note, else what it was for and
 * its id (for a charge made before payments carried a label).
 */
export function ledgerReference(row: {
  description?: string | null;
  note: string | null;
  reference: string | null;
  source_id?: string | null;
  source_type?: string | null;
}): string {
  if (row.description) {
    return row.description;
  }
  if (row.reference ?? row.note) {
    return row.reference ?? row.note ?? "";
  }
  if (row.source_type && row.source_id) {
    const label = SOURCE_LABEL[row.source_type] ?? row.source_type;
    return `${label} ${row.source_id}`;
  }
  return "None";
}

export function ReconciliationForm({
  organisationId,
  period,
}: {
  organisationId: string | undefined;
  period: Period | undefined;
}) {
  return (
    <form
      action="/payments"
      className="flex flex-wrap items-end gap-3"
      method="get"
    >
      <label className="grid gap-1 text-sm">
        From (Grenada day)
        <Input
          defaultValue={period?.start ?? ""}
          name="from"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm">
        To (inclusive)
        <Input
          defaultValue={period?.end ?? ""}
          name="to"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Organisation id (empty for all)
        <Input
          className="font-mono"
          defaultValue={organisationId ?? ""}
          maxLength={100}
          name="recon_organisation_id"
        />
      </label>
      <Button type="submit" variant="outline">
        Reconcile
      </Button>
    </form>
  );
}

export function ReconciliationPanel({
  csvHref,
  organisationId,
  period,
  report,
  rejected,
}: {
  csvHref: string | undefined;
  organisationId: string | undefined;
  period: Period | undefined;
  rejected: boolean;
  report: PaymentReconciliationPublic | undefined;
}) {
  return (
    <section aria-labelledby="reconciliation-heading" className="space-y-2">
      <PaymentsHeading id="reconciliation-heading" title="Reconciliation" />
      <ReconciliationForm organisationId={organisationId} period={period} />
      {rejected ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="alert">
          Problem: choose a valid start and end day, with the end on or after
          the start.
        </p>
      ) : null}
      {report ? (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {report.start_date} to {report.end_date}, both days included
            </span>
            {csvHref ? (
              <a className="underline" download href={csvHref}>
                Download CSV
              </a>
            ) : null}
          </div>
          {report.rows.length === 0 ? (
            <Empty className="p-4" role="status">
              <EmptyHeader>
                <EmptyTitle>No activity in that period</EmptyTitle>
                <EmptyDescription>
                  No ledger entries or balances fall between these two days,
                  both included. Try a wider range.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Payouts</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Succeeded</TableHead>
                  <TableHead className="text-right">Unmatched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={`${row.organisation_id}-${row.currency}`}>
                    <TableCell>
                      <OrgLink id={row.organisation_id} />
                    </TableCell>
                    {[
                      row.opening_minor,
                      row.charges_minor,
                      row.refunds_minor,
                      row.fees_minor,
                      row.adjustments_minor,
                      row.payouts_minor,
                      row.closing_minor,
                    ].map((minor, index) => (
                      <TableCell
                        className="text-right tabular-nums"
                        key={LEDGER_COLUMNS[index]}
                      >
                        {formatXcd(minor, row.currency)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {row.intents_succeeded}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.unmatched_intents}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}
    </section>
  );
}

const LEDGER_COLUMNS = [
  "opening",
  "charges",
  "refunds",
  "fees",
  "adjustments",
  "payouts",
  "closing",
] as const;

/** Step 1: propose a payout. A GET, so nothing is recorded until confirmed. */
export function PayoutForm() {
  return (
    <section aria-labelledby="payout-heading" className="space-y-2">
      <PaymentsHeading id="payout-heading" title="Record a payout" />
      <p className="text-muted-foreground max-w-3xl text-sm">
        Record a payout after Barrels has paid the organisation outside this
        console. It reduces the balance owed, cannot exceed it, and the ledger
        cannot be edited afterwards. You will confirm on the next step.
      </p>
      <form action="/payments" className="grid max-w-md gap-3" method="get">
        <label className="grid gap-1 text-sm">
          Organisation id
          <Input
            className="font-mono"
            maxLength={100}
            name="payout_organisation_id"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Amount (XCD, for example 1250.50)
          <Input
            inputMode="decimal"
            name="payout_amount"
            pattern="\d{1,12}(\.\d{1,2})?"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Reference (bank transfer or cheque number)
          <Input maxLength={200} name="payout_reference" required />
        </label>
        <label className="grid gap-1 text-sm">
          Note (optional)
          <Input maxLength={500} name="payout_note" />
        </label>
        <div>
          <Button type="submit" variant="outline">
            Review payout
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Step 2: show exactly what will be recorded and ask for confirmation. */
export function PayoutConfirm({
  owedMinor,
  payout,
  requestId,
}: {
  owedMinor: number | undefined;
  payout: PayoutInput;
  /** One id per rendered confirmation: the same click sent twice is one payout. */
  requestId: string;
}) {
  const over = owedMinor !== undefined && payout.amountMinor > owedMinor;
  return (
    <section aria-labelledby="payout-heading" className="space-y-3">
      <PaymentsHeading id="payout-heading" title="Confirm payout" />
      <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Organisation</dt>
        <dd className="font-mono">{payout.organisationId}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="font-medium">{formatXcd(payout.amountMinor)}</dd>
        <dt className="text-muted-foreground">Balance owed</dt>
        <dd>
          {owedMinor === undefined ? "None on record" : formatXcd(owedMinor)}
        </dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="break-all">{payout.reference}</dd>
        <dt className="text-muted-foreground">Note</dt>
        <dd>{payout.note ?? "None"}</dd>
      </dl>
      {over ? (
        <p
          className="max-w-md rounded-md border px-3 py-2 text-sm"
          role="alert"
        >
          Problem: this is more than the balance owed, so the API will refuse
          it.
        </p>
      ) : null}
      <p className="max-w-md text-sm">
        Recording a payout is permanent: ledger entries cannot be changed or
        deleted.
      </p>
      <div className="flex items-center gap-3">
        <form action={recordPayoutAction}>
          <input
            name="organisation_id"
            type="hidden"
            value={payout.organisationId}
          />
          <input
            name="amount"
            type="hidden"
            value={formatMinorPlain(payout.amountMinor)}
          />
          <input name="reference" type="hidden" value={payout.reference} />
          <input name="note" type="hidden" value={payout.note ?? ""} />
          <input name="request_id" type="hidden" value={requestId} />
          <Button type="submit" variant="outline">
            Confirm and record payout
          </Button>
        </form>
        <Link className="text-sm underline" href="/payments">
          Cancel
        </Link>
      </div>
    </section>
  );
}

const CENTS = 100;

/** 125050 -> "1250.50": the plain-dollars form the action re-parses. */
function formatMinorPlain(minor: number): string {
  return `${Math.floor(minor / CENTS)}.${String(minor % CENTS).padStart(2, "0")}`;
}

export function SectionLoading({ id, title }: { id: string; title: string }) {
  return (
    <section aria-busy="true" aria-labelledby={id} className="space-y-2">
      <PaymentsHeading id={id} title={title} />
      <Skeleton className="h-24 max-w-3xl" />
      <span className="sr-only" role="status">
        Loading {title.toLowerCase()}
      </span>
    </section>
  );
}

export function SectionError({ id, title }: { id: string; title: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <PaymentsHeading id={id} title={title} />
      <p className="rounded-md border px-3 py-2 text-sm" role="alert">
        Problem: {title.toLowerCase()} could not be loaded. Reload the page to
        try again.
      </p>
    </section>
  );
}
