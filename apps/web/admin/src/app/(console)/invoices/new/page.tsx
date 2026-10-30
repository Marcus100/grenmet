import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceEditor } from "@/components/invoice-editor";
import { StaffOnly } from "@/components/staff-only";
import { listCustomers } from "@/lib/billing-api";
import { noticeFor } from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";
import { createDraftAction } from "../actions";

export const metadata: Metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/invoices/new");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const notice = noticeFor(Array.isArray(rawNotice) ? rawNotice[0] : rawNotice);
  const customers = await listCustomers(gate.accessToken);

  return (
    <>
      <Link className="text-sm underline" href="/invoices">
        All invoices
      </Link>
      <h1 className="text-2xl font-semibold">New invoice</h1>
      {notice ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="alert">
          Problem: {notice.text}
        </p>
      ) : null}
      {customers.data.length === 0 ? (
        <p className="text-muted-foreground">
          There are no customers yet.{" "}
          <Link className="underline" href="/customers">
            Add a customer
          </Link>{" "}
          first.
        </p>
      ) : (
        <InvoiceEditor
          action={createDraftAction}
          customers={customers.data.map((customer) => ({
            id: customer.id,
            name: customer.organisation_name,
          }))}
          submitLabel="Save draft"
        />
      )}
    </>
  );
}
