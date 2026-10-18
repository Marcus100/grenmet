import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/tickets/qr-code";
import { PrintButton } from "@/components/tickets/ticket-actions";
import { getOutletSale } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatMoney, money } from "@/domain/money";
import { formatEventDate } from "@/lib/datetime";

/** Slips are live (a refunded ticket must not print as valid). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Outlet slip",
  robots: { index: false },
};

export default async function OutletSlipPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id, orderId } = await params;
  await requireViewer(`/dash/events/${id}/outlet/${orderId}`);
  const sale = await getOutletSale(id, orderId);
  if (!sale) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          className="text-body text-muted-foreground underline"
          href={`/dash/events/${id}/outlet`}
        >
          Back to outlet sales
        </Link>
        <PrintButton />
      </div>
      {sale.tickets.map((ticket) => (
        <article
          className="break-inside-avoid space-y-3 rounded-2xl border border-border bg-card p-6 text-center"
          key={ticket.id}
        >
          <h1 className="font-bold font-display text-heading-base tracking-tight">
            {sale.listingTitle}
          </h1>
          <p className="text-body text-muted-foreground">
            {formatEventDate(sale.startsAt)} · {sale.venue}
          </p>
          <p className="font-medium text-body">
            {ticket.tierName} ·{" "}
            {formatMoney(money(ticket.priceMinor, sale.currency))}
          </p>
          {ticket.status === "valid" ? (
            <>
              <QrCode
                className="mx-auto w-full max-w-56"
                label={`QR code for ticket ${ticket.code}`}
                value={ticket.qrToken}
              />
              <p className="font-mono text-heading-sm tracking-widest">
                <span className="sr-only">Ticket code </span>
                {ticket.code}
              </p>
            </>
          ) : (
            <p className="font-semibold text-destructive">
              This ticket is {ticket.status} and will not be admitted.
            </p>
          )}
          {sale.buyerName ? (
            <p className="text-caption text-muted-foreground">
              {sale.buyerName}
            </p>
          ) : null}
        </article>
      ))}
    </main>
  );
}
