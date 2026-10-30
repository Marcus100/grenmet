import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceTable } from "@/components/invoice-table";
import { StaffOnly } from "@/components/staff-only";
import { INVOICES_PAGE_SIZE, listInvoices } from "@/lib/billing-api";
import { INVOICE_STATUSES } from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/invoices");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const q = one(params.q)?.slice(0, 100);
  const status = INVOICE_STATUSES.find((item) => item === one(params.status));
  const overdue = one(params.overdue) === "true";
  const page = pageNumber(one(params.page));

  const list = await listInvoices(gate.accessToken, {
    page,
    q,
    status,
    overdue,
  });
  const lastPage = Math.max(1, Math.ceil(list.count / INVOICES_PAGE_SIZE));

  const linkTo = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (overdue) next.set("overdue", "true");
    next.set("page", String(target));
    return `/invoices?${next}` as const;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground">
            Barrels invoices to its service-line clients, in XCD.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            href="/customers"
          >
            Customers
          </Link>
          <Link
            className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            href="/invoices/new"
          >
            New invoice
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          Search
          <input
            className="bg-background rounded-md border px-2.5 py-1.5"
            defaultValue={q}
            maxLength={100}
            name="q"
            placeholder="Number or customer"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="bg-background rounded-md border px-2.5 py-1.5"
            defaultValue={status ?? ""}
            name="status"
          >
            <option value="">Any</option>
            {INVOICE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input
            defaultChecked={overdue}
            name="overdue"
            type="checkbox"
            value="true"
          />
          Overdue only
        </label>
        <button
          className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          type="submit"
        >
          Filter
        </button>
      </form>

      <InvoiceTable rows={list.data} />

      <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {list.count} total, page {Math.min(page, lastPage)} of {lastPage}
        </span>
        {page > 1 ? (
          <Link className="underline" href={linkTo(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < lastPage ? (
          <Link className="underline" href={linkTo(page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
