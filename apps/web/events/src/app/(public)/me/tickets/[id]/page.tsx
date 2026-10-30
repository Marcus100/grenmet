import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/tickets/qr-code";
import { PrintButton } from "@/components/tickets/ticket-actions";
import { TicketCancellation } from "@/components/tickets/ticket-cancellation";
import { getEventBySlug, getMyTicket } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";
import { isPaidTier } from "@/lib/orders";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = {
  title: "Ticket",
  robots: { index: false },
};

export default async function TicketPage({ params }: { params: Params }) {
  const { id } = await params;
  await requireViewer(`/me/tickets/${id}`);
  const ticket = await getMyTicket(id);
  if (!ticket) {
    notFound();
  }
  const cancelled = ticket.status !== "valid";
  const event = await getEventBySlug(ticket.listingSlug);
  const paidOnline = isPaidTier(event?.tiers ?? null, ticket.tierName);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link
        className="text-body text-muted-foreground underline print:hidden"
        href="/me/tickets"
      >
        All my tickets
      </Link>
      <div className="border-border bg-card space-y-4 rounded-2xl border p-6 text-center">
        <div className="space-y-1">
          <h1 className="font-display text-heading-base font-bold tracking-tight">
            {ticket.listingTitle}
          </h1>
          <p className="text-body text-muted-foreground">
            {formatEventDate(ticket.startsAt)}
          </p>
          <p className="text-body text-muted-foreground">{ticket.venue}</p>
          <p className="text-body font-medium">{ticket.tierName}</p>
        </div>
        {cancelled ? (
          <p className="text-destructive font-semibold">
            This ticket was cancelled.
          </p>
        ) : (
          <>
            <QrCode
              className="mx-auto w-full max-w-64"
              label={`QR code for ${ticket.listingTitle}`}
              value={ticket.qrToken}
            />
            <p className="text-heading-sm font-mono tracking-widest">
              <span className="sr-only">Ticket code </span>
              {ticket.code}
            </p>
            {ticket.admittedAt ? (
              <p className="text-body text-muted-foreground">
                Admitted — this ticket has been used.
              </p>
            ) : null}
          </>
        )}
      </div>
      {cancelled ? null : (
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
          <TicketCancellation
            canCancel={ticket.canCancel}
            paidOnline={paidOnline}
            ticketId={ticket.id}
            title={ticket.listingTitle}
          />
        </div>
      )}
    </div>
  );
}
