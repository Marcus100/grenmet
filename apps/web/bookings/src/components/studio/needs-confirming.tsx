import type { BookingAgenda } from "@barrelsgd/api-client";
import { formatDateTime } from "@barrelsgd/bookings-web/lib/booking-format";
import Link from "next/link";
import { StudioAlert } from "@/components/studio/studio-alert";
import { CARD, FOCUS } from "@/components/studio/studio-ui";
import type { StudioFailure } from "@/lib/studio-errors";
import { DEFAULT_TIMEZONE } from "@/lib/studio-view";

type Pending =
  | { ok: true; value: BookingAgenda }
  | { failure: StudioFailure; ok: false };

/**
 * Bookings waiting for the business to confirm, first thing on the agenda.
 * Always drawn: with none it says "Nothing waiting." Each row opens the
 * booking, where Confirm, Change time and Decline are.
 */
export function NeedsConfirming({
  orgSlug,
  pending,
}: Readonly<{ orgSlug: string; pending: Pending }>) {
  if (!pending.ok) {
    return (
      <section aria-labelledby="needs-confirming" className="space-y-2">
        <h2
          className="text-foreground text-lg font-semibold"
          id="needs-confirming"
        >
          Needs confirming
        </h2>
        <StudioAlert failure={pending.failure} />
      </section>
    );
  }
  const timezone = pending.value.timezone || DEFAULT_TIMEZONE;
  const items = pending.value.days.flatMap((day) => day.bookings);
  const count = pending.value.total;
  return (
    <section aria-labelledby="needs-confirming" className={`${CARD} space-y-3`}>
      <h2
        className="text-foreground text-lg font-semibold"
        id="needs-confirming"
      >
        {count > 0 ? `Needs confirming (${count})` : "Needs confirming"}
      </h2>
      {items.length === 0 ? (
        <p className="text-foreground/80">Nothing waiting.</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((booking) => (
            <li key={booking.id}>
              <Link
                className={`${FOCUS} hover:bg-muted active:bg-muted -mx-2 flex min-h-14 flex-col justify-center gap-0.5 rounded-xl px-2 py-2 transition-colors duration-[120ms]`}
                href={{ pathname: `/studio/${orgSlug}/bookings/${booking.id}` }}
              >
                <span className="text-foreground font-semibold break-words">
                  {booking.customer_name}
                </span>
                <span className="text-foreground/80 text-sm">
                  {booking.service_name}
                </span>
                <span className="text-foreground/80 text-sm">
                  {formatDateTime(booking.starts_at, timezone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {count > items.length ? (
        <p className="text-foreground/80 text-sm">
          {`Showing ${items.length} of ${count}.`}
        </p>
      ) : null}
    </section>
  );
}
