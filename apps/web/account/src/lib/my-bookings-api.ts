import "server-only";

import {
  type BookingMyBookingList,
  bookingMyBookingListSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

export interface MyBookingsQuery {
  /** True: only cancelled. False: every other booking. Omitted: all statuses. */
  cancelled?: boolean;
  /** 1-indexed; the API default (1) when omitted. */
  page?: number;
  size: number;
  /** True: starting now or later. False: earlier. Omitted: all, newest first. */
  upcoming?: boolean;
}

/**
 * The signed-in person's bookings across businesses, read on the server with
 * their app token (the same call the rewards `me` routes use). Any failure
 * throws; the page decides what to show and what to report.
 */
export function getMyBookings(
  accessToken: string,
  query: MyBookingsQuery
): Promise<BookingMyBookingList> {
  const params = new URLSearchParams({ size: String(query.size) });
  if (query.upcoming !== undefined) {
    params.set("upcoming", String(query.upcoming));
  }
  if (query.cancelled !== undefined) {
    params.set("cancelled", String(query.cancelled));
  }
  if (query.page !== undefined) params.set("page", String(query.page));
  return authApiFetch(
    getAuthConfig(),
    `/bookings/me/bookings?${params.toString()}`,
    {
      parse: (payload: unknown) => bookingMyBookingListSchema.parse(payload),
    },
    { accessToken }
  );
}
