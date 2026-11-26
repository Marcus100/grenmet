import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
import type { BookingStudioDetail } from "@barrelsgd/api-client";
import {
  formatDateTime,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DepositBadge,
  PaymentBadge,
  StatusBadge,
} from "@/components/studio/badges";
import { BookingActions } from "@/components/studio/booking-actions";
import { ContactButtons } from "@/components/studio/contact-buttons";
import { DepositReceived } from "@/components/studio/deposit-received";
import { RecordDeposit } from "@/components/studio/record-deposit";
import { ReturningClientNoticeFor } from "@/components/studio/returning-client";
import { StudioAlert } from "@/components/studio/studio-alert";
import { CARD, CARD_LINK } from "@/components/studio/studio-ui";
import { telHref } from "@/lib/phone";
import { requireSession } from "@/lib/session";
import { getBooking } from "@/lib/studio-api";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import {
  ACCEPTED_AWAITING_VIEW,
  acceptedAwaitingPayment,
  businessDepositView,
  canManageBookings,
  canMarkDepositReceived,
  type DepositState,
  depositState,
  isUuid,
  localWhenNow,
  type PaymentKind,
  paymentWord,
  paysAfterYouAccept,
  takesDeposit,
  timelineEntries,
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
  const kind = booking.payment_kind;
  const word = paymentWord(kind);
  const zone = booking.timezone;
  const entries = timelineEntries(booking.events, {
    kind,
    zone,
    startsAt: booking.starts_at,
  });
  // A deposit the customer pays the business by hand (#1869): no Barrels amount.
  const toBusiness = booking.deposit_to_business_minor ?? 0;

  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <Link className={CARD_LINK} href={{ pathname: agendaHref }}>
          Back to the agenda
        </Link>
        <PageHeader
          description={`${formatDateTime(booking.starts_at, zone)} with ${booking.provider_name}`}
          title={booking.service_name}
        />
        <div className="flex flex-wrap gap-2">
          <StatusBadge kind={kind} status={booking.status} />
          <HeaderDepositBadge booking={booking} kind={kind} state={deposit} />
        </div>
      </div>

      <PayAfterAcceptanceNotice booking={booking} word={word} />

      <ReturningClientNoticeFor
        manages={canManageBookings(org.value.role)}
        returningClient={booking.returning_client}
        status={booking.status}
      />

      {canManageBookings(org.value.role) ? (
        <BookingActions
          bookingId={booking.id}
          nonRefundable={booking.deposit_non_refundable === true}
          orgSlug={orgSlug}
          paymentKind={kind}
          refundable={
            booking.status !== "pending_payment" &&
            booking.deposit_captured_minor - booking.deposit_refunded_minor > 0
          }
          started={Date.parse(booking.starts_at) <= Date.now()}
          startsAt={booking.starts_at}
          status={booking.status}
          timezone={zone}
        />
      ) : null}

      {canManageBookings(org.value.role) && toBusiness > 0 ? (
        <DepositReceived
          amountLabel={formatMoney(toBusiness, booking.currency)}
          bookingId={booking.id}
          canMark={canMarkDepositReceived(booking)}
          latest={localWhenNow(zone)}
          orgSlug={orgSlug}
          receivedAt={booking.deposit_received_at}
          receivedMethod={booking.deposit_received_method}
          receivedReference={booking.deposit_received_reference}
          status={booking.status}
          timezone={zone}
        />
      ) : null}

      {canManageBookings(org.value.role) && toBusiness <= 0 ? (
        <RecordDeposit
          amountLabel={formatMoney(booking.deposit_minor, booking.currency)}
          bookingId={booking.id}
          due={deposit === "due" && booking.status !== "cancelled"}
          kind={kind}
          orgSlug={orgSlug}
          takesDeposit={takesDeposit(booking)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-labelledby="customer-title"
          className={`${CARD} space-y-2`}
        >
          <h2
            className="text-foreground text-lg font-semibold"
            id="customer-title"
          >
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
                    href={telHref(booking.customer.phone) ?? undefined}
                  >
                    {booking.customer.phone}
                  </a>
                ) : (
                  "Not given"
                )
              }
            />
          </dl>
          <ContactButtons phone={booking.customer.phone} />
        </section>

        <section
          aria-labelledby="payment-title"
          className={`${CARD} space-y-2`}
        >
          <h2
            className="text-foreground text-lg font-semibold"
            id="payment-title"
          >
            {kind === "payment" ? "Price and payment" : "Price and deposit"}
          </h2>
          <PriceRows booking={booking} toBusiness={toBusiness} word={word} />
        </section>
      </div>

      <section aria-labelledby="details-title" className={`${CARD} space-y-2`}>
        <h2
          className="text-foreground text-lg font-semibold"
          id="details-title"
        >
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

      <section aria-labelledby="timeline-title" className={`${CARD} space-y-2`}>
        <h2
          className="text-foreground text-lg font-semibold"
          id="timeline-title"
        >
          Timeline
        </h2>
        {booking.events.length === 0 ? (
          <p className="text-foreground/80">
            No status changes yet. Changes to this booking will be listed here.
          </p>
        ) : (
          <ol className="space-y-2">
            {entries.map((entry) => (
              <li
                className="border-border rounded-xl border p-3"
                key={entry.key}
              >
                <p className="font-medium">{entry.title}</p>
                <p className="text-foreground/80 text-sm">
                  {formatDateTime(entry.at, zone)}
                </p>
                {entry.detail ? (
                  <p className="text-sm">{entry.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

/**
 * A request paid by card after acceptance, in words: before you accept nothing
 * has been asked; after, the customer has been emailed to pay.
 */
function PayAfterAcceptanceNotice({
  booking,
  word,
}: {
  booking: BookingStudioDetail;
  word: string;
}) {
  const amount = formatMoney(booking.deposit_minor, booking.currency);
  if (acceptedAwaitingPayment(booking)) {
    return (
      <p className={CARD}>
        <strong>Accepted, awaiting payment.</strong> You accepted this request
        and the customer was emailed to pay the {word.toLowerCase()} of {amount}
        . The booking is confirmed when the payment arrives. If it does not
        arrive in time, the booking is cancelled and the time is released.
      </p>
    );
  }
  if (paysAfterYouAccept(booking)) {
    return (
      <p className={CARD}>
        Nothing has been paid yet. When you confirm this request, the customer
        is emailed to pay the {word.toLowerCase()} of {amount}, and the booking
        is confirmed once they have paid.
      </p>
    );
  }
  return null;
}

function HeaderDepositBadge({
  booking,
  kind,
  state,
}: {
  booking: BookingStudioDetail;
  kind: PaymentKind;
  state: DepositState;
}) {
  if (acceptedAwaitingPayment(booking)) {
    return <DepositBadge view={ACCEPTED_AWAITING_VIEW} />;
  }
  if ((booking.deposit_to_business_minor ?? 0) > 0) {
    return <DepositBadge view={businessDepositView(booking)} />;
  }
  return <PaymentBadge kind={kind} state={state} status={booking.status} />;
}

function PriceRows({
  booking,
  toBusiness,
  word,
}: {
  booking: BookingStudioDetail;
  toBusiness: number;
  word: string;
}) {
  return (
    <dl className="space-y-1">
      <Row
        label="Price"
        value={formatMoney(booking.price_minor, booking.currency)}
      />
      {toBusiness > 0 ? (
        <Row
          label="To the business"
          value={formatMoney(toBusiness, booking.currency)}
        />
      ) : (
        <Row
          label={`${word} asked`}
          value={
            booking.deposit_minor > 0
              ? formatMoney(booking.deposit_minor, booking.currency)
              : "None"
          }
        />
      )}
      {booking.deposit_captured_minor > 0 ? (
        <Row
          label={`${word} received`}
          value={formatMoney(booking.deposit_captured_minor, booking.currency)}
        />
      ) : null}
      {booking.deposit_refunded_minor > 0 ? (
        <Row
          label={`${word} refunded`}
          value={formatMoney(booking.deposit_refunded_minor, booking.currency)}
        />
      ) : null}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-foreground/80">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
