import type { BookingStatus } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";

// Staff only. The API's `returning_client` flag says a client who already had a
// confirmed or completed booking asked for a new-clients-only service. It is
// information for the staff member, never an accusation, and it must never be
// drawn on a public or customer page.

/** An outlined tag on an agenda row; the words carry the meaning, not the outline. */
export function ReturningClientTag() {
  return (
    <Badge className="h-6 px-2.5 text-xs" variant="outline">
      Returning client
    </Badge>
  );
}

/** The notice on booking detail, beside the confirm and decline actions. */
export function ReturningClientNotice() {
  return (
    <section
      aria-labelledby="returning-client-title"
      className="border-border space-y-1 rounded-xl border p-4"
    >
      <h2 className="text-foreground font-semibold" id="returning-client-title">
        Returning client
      </h2>
      <p className="text-foreground/80">
        They&apos;ve booked with you before. This service is for new clients.
        Confirm the booking if you still want to see them, or decline it.
      </p>
    </section>
  );
}

/**
 * The notice for a staff member on a request still waiting for an answer.
 * Nothing is drawn for a member, or once the booking is confirmed or declined.
 */
export function ReturningClientNoticeFor({
  manages,
  returningClient,
  status,
}: Readonly<{
  manages: boolean;
  returningClient: boolean | undefined;
  status: BookingStatus;
}>) {
  return manages && returningClient === true && status === "pending" ? (
    <ReturningClientNotice />
  ) : null;
}
