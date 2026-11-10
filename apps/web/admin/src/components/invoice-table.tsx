import {
  type InvoiceStatus,
  type InvoiceSummaryPublic,
  invoiceStatus,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import Link from "next/link";
import { formatMinor, isOpenInvoice } from "@/lib/invoice-form";

/** The list columns the table shows, typed from the generated invoice summary. */
export type InvoiceRow = Pick<
  InvoiceSummaryPublic,
  | "currency"
  | "customer_name"
  | "id"
  | "number"
  | "outstanding_minor"
  | "status"
  | "total_minor"
> &
  Partial<Pick<InvoiceSummaryPublic, "due_date" | "issue_date">>;

/** A label for every generated status: a new backend status fails type-check here. */
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  [invoiceStatus.draft]: "Draft",
  [invoiceStatus.issued]: "Issued",
  [invoiceStatus.partially_paid]: "Partially paid",
  [invoiceStatus.paid]: "Paid",
  [invoiceStatus.void]: "Void",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  let variant: "light-success" | "light-warning" | "secondary" = "secondary";
  if (status === invoiceStatus.paid) variant = "light-success";
  else if (isOpenInvoice(status)) variant = "light-warning";
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" role="status">
        No invoices match.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link
                className="font-medium underline-offset-4 hover:underline"
                href={`/invoices/${encodeURIComponent(row.id)}`}
              >
                {row.number ?? "Draft"}
              </Link>
            </TableCell>
            <TableCell>{row.customer_name}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell>{row.due_date ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.currency} {formatMinor(row.total_minor)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.currency} {formatMinor(row.outstanding_minor)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
