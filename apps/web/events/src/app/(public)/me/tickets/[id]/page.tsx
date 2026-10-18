import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/tickets/qr-code";
import {
  CancelTicketButton,
  PrintButton,
} from "@/components/tickets/ticket-actions";
import { getMyTicket } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

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
  const cancelled = ticket.status === "cancelled";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link
        className="text-body text-muted-foreground underline print:hidden"
        href="/me/tickets"
      >
        All my tickets
      </Link>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <div className="space-y-1">
          <h1 className="font-bold font-display text-heading-base tracking-tight">
            {ticket.listingTitle}
          </h1>
          <p className="text-body text-muted-foreground">
            {formatEventDate(ticket.startsAt)}
          </p>
          <p className="text-body text-muted-foreground">{ticket.venue}</p>
          <p className="font-medium text-body">{ticket.tierName}</p>
        </div>
        {cancelled ? (
          <p className="font-semibold text-destructive">
            This ticket was cancelled.
          </p>
        ) : (
          <>
            <QrCode
              className="mx-auto w-full max-w-64"
              label={`QR code for ${ticket.listingTitle}`}
              value={ticket.qrToken}
            />
            <p className="font-mono text-heading-sm tracking-widest">
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
          {ticket.canCancel ? (
            <CancelTicketButton
              ticketId={ticket.id}
              title={ticket.listingTitle}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
