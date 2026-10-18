import type { Metadata } from "next";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { listMyTickets } from "@/lib/account-rewards";
import { getAppHrefs } from "@/lib/app-links";

export const metadata: Metadata = { title: "Tickets — Barrels account" };
export const dynamic = "force-dynamic";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Grenada",
  });
}

export default async function TicketsPage() {
  const session = await requireAccount();
  const tickets = await listMyTickets(session.access_token);
  const eventsHref = getAppHrefs().events;

  return (
    <AccountLayout
      current="/tickets"
      description="Your tickets from Barrels Events. Open Events to show a ticket's QR code at the door or to cancel one."
      title="Tickets"
    >
      <SettingsSection title="Your tickets">
        {tickets.length === 0 ? (
          <p className="py-5 text-muted-foreground text-sm">
            You have no tickets yet.
            {eventsHref ? (
              <>
                {" "}
                <a className="underline" href={eventsHref}>
                  Find an event
                </a>
                .
              </>
            ) : null}
          </p>
        ) : null}
        {tickets.map((ticket) => (
          <SettingsRow
            description={`${when(ticket.starts_at)} · ${ticket.venue}`}
            key={ticket.id}
            title={ticket.listing_title}
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">{ticket.tier_name}</StatusBadge>
              {ticket.admitted_at ? (
                <StatusBadge tone="on">Admitted</StatusBadge>
              ) : null}
              {ticket.status === "cancelled" ? (
                <StatusBadge tone="off">Cancelled</StatusBadge>
              ) : null}
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>
    </AccountLayout>
  );
}
