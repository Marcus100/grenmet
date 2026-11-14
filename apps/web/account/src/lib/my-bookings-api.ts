import "server-only";

import {
  type BookingMyBookingList,
  bookingMyBookingListSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

export interface MyBookingsQuery {
  /** 1-indexed; the API default (1) when omitted. */
  page?: number;
  size: number;
  /** True: starting now or later. False: earlier. */
  upcoming: boolean;
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
  const params = new URLSearchParams({
    upcoming: String(query.upcoming),
    size: String(query.size),
  });
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
