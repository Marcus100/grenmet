import type { InvoiceDetailPublic } from "@barrelsgd/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  deleteDraftAction,
  issueAction,
  recordPaymentAction,
  voidAction,
} from "@/app/(console)/invoices/actions";
import { formatMinor } from "@/lib/invoice-form";

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";
export const BUTTON = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

function money(invoice: InvoiceDetailPublic, minor: number): string {
  return `${invoice.currency} ${formatMinor(minor)}`;
}

/** A fixed-code notice from `?notice=`; renders nothing without one. */
export function NoticeBanner({
  notice,
}: {
  notice: { text: string; tone: "ok" | "problem" } | undefined;
}) {
  if (!notice) return null;
  return (
    <p
      className="rounded-md border px-3 py-2 text-sm"
      role={notice.tone === "ok" ? "status" : "alert"}
    >
      {notice.tone === "ok" ? "" : "Problem: "}
      {notice.text}
    </p>
  );
}

export function VoidedNote({ invoice }: { invoice: InvoiceDetailPublic }) {
  if (invoice.status !== "void") return null;
  return (
    <p className="text-sm">
      Voided{invoice.void_reason ? `: ${invoice.void_reason}` : ""}.
    </p>
  );
}

function HiddenId({ id }: { id: string }) {
  return <input name="invoice_id" type="hidden" value={id} />;
}

/** Lines and the totals the server calculated. */
export function LinesPanel({ invoice }: { invoice: InvoiceDetailPublic }) {
  const total = (minor: number) => money(invoice, minor);
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-lg">
        {invoice.status === "draft" ? "Calculated by the server" : "Lines"}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">VAT</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.description}</TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMinor(line.unit_price_minor)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.tax_rate}%
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMinor(line.subtotal_minor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
        <dt>Subtotal</dt>
        <dd className="text-right tabular-nums">
          {total(invoice.subtotal_minor)}
        </dd>
        <dt>VAT</dt>
        <dd className="text-right tabular-nums">{total(invoice.tax_minor)}</dd>
        <dt className="font-medium">Total</dt>
        <dd className="text-right font-medium tabular-nums">
          {total(invoice.total_minor)}
        </dd>
        <dt>Paid</dt>
        <dd className="text-right tabular-nums">{total(invoice.paid_minor)}</dd>
        <dt className="font-medium">Outstanding</dt>
        <dd className="text-right font-medium tabular-nums">
          {total(invoice.outstanding_minor)}
        </dd>
      </dl>
      {invoice.notes ? (
        <p className="whitespace-pre-line text-muted-foreground text-sm">
          {invoice.notes}
        </p>
      ) : null}
    </section>
  );
}

export function PaymentsList({ invoice }: { invoice: InvoiceDetailPublic }) {
  if (invoice.payments.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-lg">Payments</h2>
      <ul className="space-y-1 text-sm">
        {invoice.payments.map((payment) => (
          <li key={payment.id}>
            {payment.paid_date}: {money(invoice, payment.amount_minor)} by{" "}
            {payment.method.replace("_", " ")}
            {payment.reference ? `, ref ${payment.reference}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Issue (assigns the number, emails the customer) or delete a draft. */
export function IssuePanel({ invoice }: { invoice: InvoiceDetailPublic }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Issue</h2>
      <p className="text-muted-foreground text-sm">
        Issuing assigns the next invoice number, sets the due date (net 30),
        stores the PDF and emails {invoice.billing_email}. It cannot be undone;
        an issued invoice can only be voided.
      </p>
      <form action={issueAction} className="flex flex-wrap items-end gap-3">
        <HiddenId id={invoice.id} />
        <label className="grid gap-1 text-sm">
          Issue date (optional)
          <input className={FIELD} name="issue_date" type="date" />
        </label>
        <button className={BUTTON} type="submit">
          Issue invoice
        </button>
      </form>
      <form action={deleteDraftAction}>
        <HiddenId id={invoice.id} />
        <button className={BUTTON} type="submit">
          Delete draft
        </button>
      </form>
    </section>
  );
}

export function PaymentPanel({
  invoice,
  today,
}: {
  invoice: InvoiceDetailPublic;
  today: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Record a payment</h2>
      <p className="text-muted-foreground text-sm">
        Manual payments only: bank transfer, cash or cheque. A payment above the
        outstanding balance is refused.
      </p>
      <form action={recordPaymentAction} className="grid max-w-md gap-3">
        <HiddenId id={invoice.id} />
        <label className="grid gap-1 text-sm">
          Method
          <select className={FIELD} defaultValue="bank_transfer" name="method">
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Amount ({invoice.currency})
          <input
            className={FIELD}
            defaultValue={formatMinor(invoice.outstanding_minor).replaceAll(
              ",",
              ""
            )}
            inputMode="decimal"
            name="amount"
            required
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Date received
          <input
            className={FIELD}
            defaultValue={today}
            max={today}
            name="paid_date"
            required
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Reference (optional)
          <input
            className={FIELD}
            maxLength={200}
            name="reference"
            type="text"
          />
        </label>
        <div>
          <button className={BUTTON} type="submit">
            Record payment
          </button>
        </div>
      </form>
    </section>
  );
}

export function VoidPanel({ invoice }: { invoice: InvoiceDetailPublic }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm underline">
        Void this invoice
      </summary>
      <form action={voidAction} className="mt-3 grid max-w-md gap-3">
        <HiddenId id={invoice.id} />
        <label className="grid gap-1 text-sm">
          Reason (kept in the history)
          <textarea
            className={FIELD}
            maxLength={500}
            minLength={3}
            name="reason"
            required
            rows={2}
          />
        </label>
        <div>
          <button className={BUTTON} type="submit">
            Void invoice
          </button>
        </div>
      </form>
    </details>
  );
}
