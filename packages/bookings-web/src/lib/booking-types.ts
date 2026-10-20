// Shapes the booking components exchange with their host app. The host owns
// the server calls (Server Actions, route handlers) and passes them in as
// props; these types describe the data and the action callbacks only.

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import type { Outcome } from "./booking-errors";

export interface SlotChoice {
  ends_at: string;
  starts_at: string;
}

/** A way to reach the studio by hand, for when online booking cannot help. */
export interface ContactChannel {
  href: string;
  /** The channel's name as a visitor knows it, e.g. "Instagram". */
  label: string;
}

/** Open slots for a window of days, in the studio's timezone (IANA name). */
export interface SlotList {
  slots: SlotChoice[];
  timezone: string;
}

/** What the booking form sends when the visitor submits a request. */
export interface BookingInput {
  email: string;
  idempotencyKey: string;
  marketingConsent: boolean;
  name: string;
  notes: string;
  phone: string;
  serviceId: string;
  startsAt: string;
  turnstileToken: string;
  website: string;
}

/** A created booking plus the manage token, which is shown only once. */
export interface Booked {
  booking: BookingPublicDetail;
  manageToken: string;
}

/** Calls the new-booking form needs. Each one returns an outcome, never throws for API answers. */
export interface BookingFlowActions {
  loadSlots: (
    serviceId: string,
    firstDay: string
  ) => Promise<Outcome<SlotList>>;
  submitBooking: (input: BookingInput) => Promise<Outcome<Booked>>;
}

/** Calls the manage-a-booking page needs. The token identifies the booking. */
export interface ManageBookingActions {
  cancel: (token: string) => Promise<Outcome<BookingPublicDetail>>;
  loadSlots: (token: string, firstDay: string) => Promise<Outcome<SlotList>>;
  reschedule: (
    token: string,
    startsAt: string
  ) => Promise<Outcome<BookingPublicDetail>>;
}
