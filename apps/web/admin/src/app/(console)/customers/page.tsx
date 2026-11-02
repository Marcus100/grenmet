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
import { listCustomers, listOrganisationChoices } from "@/lib/billing-api";
import { noticeFor } from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";
import { createCustomerAction } from "../invoices/actions";

export const metadata: Metadata = { title: "Billing customers" };
export const dynamic = "force-dynamic";

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/customers");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const notice = noticeFor(Array.isArray(rawNotice) ? rawNotice[0] : rawNotice);
  const [customers, organisations] = await Promise.all([
    listCustomers(gate.accessToken),
    listOrganisationChoices(gate.accessToken),
  ]);
  const taken = new Set(customers.data.map((item) => item.organisation_id));
  const available = organisations.data.filter((item) => !taken.has(item.id));

  return (
    <>
      <Link className="text-sm underline" href="/invoices">
        All invoices
      </Link>
      <h1 className="text-2xl font-semibold">Billing customers</h1>
      <p className="text-muted-foreground">
        A customer is a platform organisation that Barrels invoices.
      </p>
      {notice ? (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          role={notice.tone === "ok" ? "status" : "alert"}
        >
          {notice.tone === "ok" ? "" : "Problem: "}
          {notice.text}
        </p>
      ) : null}

      {customers.data.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          No customers yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Billing email</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.data.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>{customer.organisation_name}</TableCell>
                <TableCell>{customer.billing_email}</TableCell>
                <TableCell className="whitespace-pre-line">
                  {customer.address ?? "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a customer</h2>
        {available.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Every active organisation is already a customer.
          </p>
        ) : (
          <form action={createCustomerAction} className="grid max-w-md gap-3">
            <label className="grid gap-1 text-sm">
              Organisation
              <select
                className={FIELD}
                defaultValue=""
                name="organisation_id"
                required
              >
                <option disabled value="">
                  Choose an organisation
                </option>
                {available.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Billing email
              <input
                className={FIELD}
                maxLength={320}
                name="billing_email"
                required
                type="email"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Address (optional)
              <textarea
                className={FIELD}
                maxLength={1000}
                name="address"
                rows={3}
              />
            </label>
            <div>
              <button
                className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
                type="submit"
              >
                Add customer
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
