import {
  formatDateTime,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DepositBadge, StatusBadge } from "@/components/studio/badges";
import { BookingActions } from "@/components/studio/booking-actions";
import { RecordDeposit } from "@/components/studio/record-deposit";
import { StudioAlert } from "@/components/studio/studio-alert";
import { requireSession } from "@/lib/session";
import { getBooking } from "@/lib/studio-api";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import {
  canManageBookings,
  depositState,
  eventLabel,
  isUuid,
  takesDeposit,
} from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Booking",
};

interface BookingPageProps {
  params: Promise<{ id: string; orgSlug: string }>;
}

const SOURCE_LABEL: Record<string, string> = {
  online: "Online booking page",
  studio: "Entered by staff",
};

/** Read-only booking detail: customer, deposit and the status timeline. */
export default async function StudioBookingPage({ params }: BookingPageProps) {
  const { id, orgSlug } = await params;
  const agendaHref = `/studio/${orgSlug}/agenda`;
  const session = await requireSession(`/studio/${orgSlug}/bookings/${id}`);

  if (!isUuid(id)) {
    notFound();
  }

  const org = await loadOrganisation(
    session,
    orgSlug,
    `/studio/${orgSlug}/bookings/${id}`
  );
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  const organisationId = org.value.id;

  const result = await guarded(
    () => getBooking(session.accessToken, organisationId, id),
    `/studio/${orgSlug}/bookings/${id}`
  );
  if (!result.ok) {
    return (
      <StudioAlert
        backHref={agendaHref}
        backLabel="Back to the agenda"
        failure={result.failure}
      />
    );
  }
  const booking = result.value;
  if (!booking) {
    notFound();
  }

  const deposit = depositState(booking);
  const zone = booking.timezone;

  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <Link
          className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
          href={{ pathname: agendaHref }}
        >
          Back to the agenda
        </Link>
        <h1 className="text-2xl font-semibold">{booking.service_name}</h1>
        <p className="text-muted-foreground">
          {formatDateTime(booking.starts_at, zone)} with {booking.provider_name}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge status={booking.status} />
          <DepositBadge state={deposit} />
        </div>
      </div>

      {canManageBookings(org.value.role) ? (
        <BookingActions
          bookingId={booking.id}
          orgSlug={orgSlug}
          refundable={
            booking.status !== "pending_payment" &&
            booking.deposit_captured_minor - booking.deposit_refunded_minor > 0
          }
          started={Date.parse(booking.starts_at) <= Date.now()}
          status={booking.status}
        />
      ) : null}

      {canManageBookings(org.value.role) ? (
        <RecordDeposit
          amountLabel={formatMoney(booking.deposit_minor)}
          bookingId={booking.id}
          due={deposit === "due"}
          orgSlug={orgSlug}
          takesDeposit={takesDeposit(booking)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-labelledby="customer-title"
          className="border-border space-y-2 rounded-lg border p-4"
        >
          <h2 className="text-lg font-semibold" id="customer-title">
            Customer
          </h2>
          <dl className="space-y-1">
            <Row label="Name" value={booking.customer.name} />
            <Row
              label="Email"
              value={
                booking.customer.email ? (
                  <a
                    className="text-primary underline underline-offset-4"
                    href={`mailto:${booking.customer.email}`}
                  >
                    {booking.customer.email}
                  </a>
                ) : (
                  "Not given"
                )
              }
            />
            <Row
              label="Phone"
              value={
                booking.customer.phone ? (
                  <a
                    className="text-primary underline underline-offset-4"
                    href={`tel:${booking.customer.phone}`}
                  >
                    {booking.customer.phone}
                  </a>
                ) : (
                  "Not given"
                )
              }
            />
          </dl>
        </section>

        <section
          aria-labelledby="payment-title"
          className="border-border space-y-2 rounded-lg border p-4"
        >
          <h2 className="text-lg font-semibold" id="payment-title">
            Price and deposit
          </h2>
          <dl className="space-y-1">
            <Row label="Price" value={formatMoney(booking.price_minor)} />
            <Row
              label="Deposit asked"
              value={
                booking.deposit_minor > 0
                  ? formatMoney(booking.deposit_minor)
                  : "None"
              }
            />
            {booking.deposit_captured_minor > 0 ? (
              <Row
                label="Deposit received"
                value={formatMoney(booking.deposit_captured_minor)}
              />
            ) : null}
            {booking.deposit_refunded_minor > 0 ? (
              <Row
                label="Deposit refunded"
                value={formatMoney(booking.deposit_refunded_minor)}
              />
            ) : null}
          </dl>
        </section>
      </div>

      <section
        aria-labelledby="details-title"
        className="border-border space-y-2 rounded-lg border p-4"
      >
        <h2 className="text-lg font-semibold" id="details-title">
          Details
        </h2>
        <dl className="space-y-1">
          <Row
            label="Booked"
            value={`${formatDateTime(booking.created_at, zone)}, ${SOURCE_LABEL[booking.source] ?? booking.source}`}
          />
          <Row label="Notes" value={booking.notes ?? "None"} />
          {booking.cancel_reason ? (
            <Row label="Cancel reason" value={booking.cancel_reason} />
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="timeline-title" className="space-y-2">
        <h2 className="text-lg font-semibold" id="timeline-title">
          Timeline
        </h2>
        {booking.events.length === 0 ? (
          <p className="text-muted-foreground">
            No status changes yet. Changes to this booking will be listed here.
          </p>
        ) : (
          <ol className="space-y-2">
            {booking.events.map((event) => (
              <li
                className="border-border rounded-lg border p-3"
                key={`${event.created_at}-${event.to_status}`}
              >
                <p className="font-medium">
                  {eventLabel(event.from_status, event.to_status)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {formatDateTime(event.created_at, zone)}
                </p>
                {event.note ? <p className="text-sm">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
