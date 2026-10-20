import { CancelTicketButton } from "./ticket-actions";

/**
 * Free tickets can be cancelled by the holder. A ticket paid online cannot:
 * the money is returned by the organiser's refund, which cancels the ticket.
 */
export function TicketCancellation({
  canCancel,
  paidOnline,
  ticketId,
  title,
}: {
  canCancel: boolean;
  paidOnline: boolean;
  ticketId: string;
  title: string;
}) {
  if (!canCancel) {
    return null;
  }
  if (paidOnline) {
    return (
      <p className="text-body text-muted-foreground print:hidden">
        This ticket was paid online. To cancel it, ask the organiser for a
        refund; the refund cancels the ticket.
      </p>
    );
  }
  return <CancelTicketButton ticketId={ticketId} title={title} />;
}
