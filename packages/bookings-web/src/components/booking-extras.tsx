"use client";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import {
  showsBusinessDeposit,
  showsDepositReceived,
} from "../lib/booking-extras";
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
      {showsBusinessDeposit(booking) && !booking.deposit_received && (
        <DepositToBusiness
          businessName={booking.business_name ?? ""}
          contact={booking.contact}
          currency={currency}
          instructions={booking.deposit_instructions}
          minor={booking.deposit_to_business_minor ?? 0}
        />
      )}
      {withNewClients && <NewClientsNote booked service={booking} />}
    </>
  );
}
