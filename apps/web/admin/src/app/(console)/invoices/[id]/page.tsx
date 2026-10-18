import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";
import {
  BUTTON,
  IssuePanel,
  LinesPanel,
  NoticeBanner,
  PaymentPanel,
  PaymentsList,
  VoidedNote,
  VoidPanel,
} from "@/components/invoice-panels";
import { StatusBadge } from "@/components/invoice-table";
import { StaffOnly } from "@/components/staff-only";
import { getInvoice, listCustomers } from "@/lib/billing-api";
import { noticeFor, parseId, todayInGrenada } from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";
import { saveDraftAction } from "../actions";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const gate = await requireGate(`/invoices/${id}`);
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const notice = noticeFor(Array.isArray(rawNotice) ? rawNotice[0] : rawNotice);

  let invoice: Awaited<ReturnType<typeof getInvoice>>;
  try {
    invoice = await getInvoice(gate.accessToken, id);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const isDraft = invoice.status === "draft";
  const isOpen =
    invoice.status === "issued" || invoice.status === "partially_paid";
  const customers = isDraft ? await listCustomers(gate.accessToken) : null;

  return (
    <>
      <Link className="text-sm underline" href="/invoices">
        All invoices
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl">
          {invoice.number ?? "Draft invoice"}
        </h1>
        <StatusBadge status={invoice.status} />
        <a
          className={`${BUTTON} ml-auto`}
          download
          href={`/invoices/${encodeURIComponent(invoice.id)}/pdf`}
        >
          Download PDF
        </a>
      </div>
      <NoticeBanner notice={notice} />

      <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Customer</dt>
          <dd>{invoice.customer_name}</dd>
          <dd className="text-muted-foreground">{invoice.billing_email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dates</dt>
          <dd>Issued {invoice.issue_date ?? "not yet"}</dd>
          <dd>Due {invoice.due_date ?? "not yet"}</dd>
        </div>
      </dl>

      {customers ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Edit draft</h2>
          <InvoiceEditor
            action={saveDraftAction}
            customers={customers.data.map((customer) => ({
              id: customer.id,
              name: customer.organisation_name,
            }))}
            draft={{
              id: invoice.id,
              customer_id: invoice.customer_id,
              notes: invoice.notes,
              lines: invoice.lines,
            }}
            submitLabel="Save draft"
          />
        </section>
      ) : null}

      <LinesPanel invoice={invoice} />
      <PaymentsList invoice={invoice} />

      <VoidedNote invoice={invoice} />

      {isDraft ? <IssuePanel invoice={invoice} /> : null}
      {isOpen ? (
        <PaymentPanel invoice={invoice} today={todayInGrenada()} />
      ) : null}
      {invoice.status === "issued" ? <VoidPanel invoice={invoice} /> : null}
    </>
  );
}
