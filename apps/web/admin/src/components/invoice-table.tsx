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
import { formatMinor } from "@/lib/invoice-form";

export interface InvoiceRow {
  currency: string;
  customer_name: string;
  due_date?: string | null;
  id: string;
  issue_date?: string | null;
  number?: string | null;
  outstanding_minor: number;
  status: string;
  total_minor: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export function StatusBadge({ status }: { status: string }) {
  let variant: "light-success" | "light-warning" | "secondary" = "secondary";
  if (status === "paid") variant = "light-success";
  else if (status === "issued" || status === "partially_paid") {
    variant = "light-warning";
  }
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
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
