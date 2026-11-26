"use client";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import {
  businessDepositAwaitsAcceptance,
  businessDepositLaterLine,
  showsBusinessDeposit,
  showsDepositReceived,
} from "../lib/booking-extras";
import { acceptedAwaitingPayment } from "../lib/booking-payment";
import { DepositReceivedNotice, DepositToBusiness } from "./business-deposit";
import { NewClientsNote } from "./new-clients-note";

/**
 * What a made booking adds to the page: the deposit to pay the business (with
 * its own instructions) while the booking is pending or confirmed, and the note
 * for a new-clients-only service. Used by the confirmation and the manage page.
 */
export function BookedExtras({
  booking,
  currency,
  withNewClients,
}: {
  booking: BookingPublicDetail;
  currency: string;
  /** False once the booking is over: the new-clients note is no longer useful. */
  withNewClients: boolean;
}) {
  return (
    <>
      {showsDepositReceived(booking) && (
        <DepositReceivedNotice
          businessName={booking.business_name ?? ""}
          currency={currency}
          minor={booking.deposit_to_business_minor ?? 0}
        />
      )}
      {businessDepositAwaitsAcceptance(booking) && (
        <p className="notice deposit-business">
          {businessDepositLaterLine(
            booking.deposit_to_business_minor ?? 0,
            currency,
            booking.business_name ?? "",
            true
          )}
        </p>
      )}
      {showsBusinessDeposit(booking) &&
        !booking.deposit_received &&
        !businessDepositAwaitsAcceptance(booking) && (
          <DepositToBusiness
            businessName={booking.business_name ?? ""}
            contact={booking.contact}
            currency={currency}
            instructions={booking.deposit_instructions}
            minor={booking.deposit_to_business_minor ?? 0}
          />
        )}
      {/* Once the business accepted, "it stays a request" is no longer true. */}
      {withNewClients && !acceptedAwaitingPayment(booking) && (
        <NewClientsNote booked service={booking} />
      )}
    </>
  );
}
