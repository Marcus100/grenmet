import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { getMyTickets } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import type { MyTicket } from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "My tickets",
  robots: { index: false },
};

function TicketRow({ ticket }: { ticket: MyTicket }) {
  const used = ticket.admittedAt !== null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <p className="font-display font-semibold text-heading-sm">
          {ticket.listingTitle}
        </p>
        <p className="text-body text-muted-foreground">
          {formatEventDate(ticket.startsAt)} · {ticket.venue}
        </p>
        <p className="text-caption text-muted-foreground">
          {ticket.tierName} ·{" "}
          <span className="font-mono tracking-wider">{ticket.code}</span>
          {used ? " · Used" : ""}
          {ticket.status === "valid" ? "" : " · Cancelled"}
        </p>
      </div>
      {ticket.status === "valid" ? (
        <Link
          className={cn(buttonVariants({ variant: "default" }))}
          href={`/me/tickets/${ticket.id}`}
        >
          Show QR code
        </Link>
      ) : null}
    </li>
  );
}

export default async function MyTicketsPage() {
  await requireViewer("/me/tickets");
  const tickets = await getMyTickets();
  const now = Date.now();
  const upcoming = tickets.filter(
    (ticket) =>
      ticket.status === "valid" && new Date(ticket.endsAt).getTime() > now
  );
  const past = tickets.filter((ticket) => !upcoming.includes(ticket));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-bold font-display text-heading-base tracking-tight">
          My tickets
        </h1>
        <p className="text-body text-muted-foreground">
          Show the QR code at the door, or read out the code under it.
        </p>
      </header>

      {tickets.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No tickets yet.{" "}
          <Link className="underline" href="/events">
            Find an event
          </Link>
          .
        </p>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-heading-sm">
            Upcoming
          </h2>
          <ul className="space-y-3">
            {upcoming.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-heading-sm">
            Past and cancelled
          </h2>
          <ul className="space-y-3">
            {past.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
