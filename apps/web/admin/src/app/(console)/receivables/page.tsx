import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffOnly } from "@/components/staff-only";
import { getReceivables, RECEIVABLES_PAGE_SIZE } from "@/lib/billing-api";
import { formatMinor } from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Receivables" };
export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  days_1_30: "1 to 30 days",
  days_31_60: "31 to 60 days",
  days_61_90: "61 to 90 days",
  over_90: "Over 90 days",
};

function pageNumber(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(first ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/receivables");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const page = pageNumber((await searchParams).page);
  const report = await getReceivables(gate.accessToken, page);
  const money = (minor: number) => `${report.currency} ${formatMinor(minor)}`;
  const lastPage = Math.max(1, Math.ceil(report.count / RECEIVABLES_PAGE_SIZE));

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Receivables</h1>
        <p className="text-muted-foreground">
          Open invoices as of {report.as_of}, aged by days past the due date.
          Outstanding in total: {money(report.total_outstanding_minor)}.
        </p>
      </div>

      <section aria-label="Ageing" className="grid gap-3 sm:grid-cols-5">
        {report.buckets.map((bucket) => (
          <div className="rounded-md border p-3" key={bucket.bucket}>
            <div className="text-muted-foreground text-xs">
              {BUCKET_LABEL[bucket.bucket] ?? bucket.bucket}
            </div>
            <div className="font-semibold tabular-nums">
              {money(bucket.outstanding_minor)}
            </div>
            <div className="text-muted-foreground text-xs">
              {bucket.invoice_count} invoice
              {bucket.invoice_count === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </section>

      {report.data.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          Nothing is outstanding.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Ageing</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.map((row) => (
              <TableRow key={row.invoice_id}>
                <TableCell>
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={`/invoices/${encodeURIComponent(row.invoice_id)}`}
                  >
                    {row.number}
                  </Link>
                </TableCell>
                <TableCell>{row.customer_name}</TableCell>
                <TableCell>{row.due_date}</TableCell>
                <TableCell>
                  {BUCKET_LABEL[row.bucket] ?? row.bucket}
                  {row.days_overdue > 0
                    ? `, ${row.days_overdue} days late`
                    : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.outstanding_minor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {report.count} open, page {Math.min(page, lastPage)} of {lastPage}
        </span>
        {page > 1 ? (
          <Link className="underline" href={`/receivables?page=${page - 1}`}>
            Previous
          </Link>
        ) : null}
        {page < lastPage ? (
          <Link className="underline" href={`/receivables?page=${page + 1}`}>
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
