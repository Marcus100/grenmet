// Server-side calls to the Barrels Bookings public API, through the generated
// client. Import this only from Server Components, Server Actions and route
// handlers: it reads the server-only API address. Every call names the
// business by its slug, because this app serves any tenant.

import "server-only";

import {
  type BookingAvailability,
  type BookingPublicDetail,
  type BookingPublicReceipt,
  type BookingStorefront,
  bookingsCancelPublicBooking,
  bookingsCreatePublicBooking,
  bookingsGetAvailability,
  bookingsGetPublicBooking,
  bookingsGetPublicBookingIcs,
  bookingsGetStorefront,
  bookingsReschedulePublicBooking,
  createClient,
  ResponseError,
} from "@barrelsgd/api-client";
import { windowFrom } from "@barrelsgd/bookings-web/lib/booking-format";
import { headers } from "next/headers";
import { env } from "@/env";
import { visitorHeaders } from "@/lib/visitor-headers";

// Next calls the API from one address, so the visitor's own address travels in
// headers the API trusts only with the shared secret (src/rate_limit.py).
async function options() {
  const visitor = visitorHeaders(await headers(), env.TRUSTED_WEB_SECRET);
  return {
    client: createClient({ baseURL: env.AUTH_API_URL, headers: visitor }),
  };
}

// An unknown token answers 404; a malformed one (too short) answers 422. Both
// mean "no such booking" to a visitor.
function nullOn404<T>(error: unknown): T | null {
  if (
    error instanceof ResponseError &&
    (error.status === 404 || error.status === 422)
  ) {
    return null;
  }
  throw error;
}

/** A business's services and providers; null for an unknown or switched-off slug. */
export async function getStorefront(
  slug: string
): Promise<BookingStorefront | null> {
  try {
    return await bookingsGetStorefront({
      ...(await options()),
      path: { slug },
    }).unwrap();
  } catch (error) {
    return nullOn404(error);
  }
}

/** Open slots for a service over the 14 days from `firstDay` (YYYY-MM-DD). */
export async function getAvailability(
  slug: string,
  serviceId: string,
  firstDay: string,
  providerId?: string
): Promise<BookingAvailability> {
  const { lastDay } = windowFrom(firstDay);
  return bookingsGetAvailability({
    ...(await options()),
    path: { slug },
    query: {
      service_id: serviceId,
      first_day: firstDay,
      last_day: lastDay,
      ...(providerId ? { provider_id: providerId } : {}),
    },
  }).unwrap();
}

export interface NewBooking {
  customer_email: string;
  customer_name: string;
  customer_phone?: string;
  marketing_consent: boolean;
  notes?: string;
  service_id: string;
  starts_at: string;
  turnstile_token?: string;
  website?: string;
}

export async function createBooking(
  slug: string,
  body: NewBooking,
  idempotencyKey: string
): Promise<BookingPublicReceipt> {
  return bookingsCreatePublicBooking({
    ...(await options()),
    path: { slug },
    headers: { "Idempotency-Key": idempotencyKey },
    body,
  }).unwrap();
}

/** The customer's booking; null for an unknown, expired or cleared token. */
export async function getBooking(
  token: string
): Promise<BookingPublicDetail | null> {
  try {
    return await bookingsGetPublicBooking({
      ...(await options()),
      path: { token },
    }).unwrap();
  } catch (error) {
    return nullOn404(error);
  }
}

export async function cancelBooking(
  token: string
): Promise<BookingPublicDetail> {
  return bookingsCancelPublicBooking({
    ...(await options()),
    path: { token },
    body: {},
  }).unwrap();
}

export async function rescheduleBooking(
  token: string,
  startsAt: string
): Promise<BookingPublicDetail> {
  return bookingsReschedulePublicBooking({
    ...(await options()),
    path: { token },
    body: { starts_at: startsAt },
  }).unwrap();
}

/** The booking as iCalendar text; null for an unknown token. */
export async function getBookingIcs(token: string): Promise<string | null> {
  try {
    return await bookingsGetPublicBookingIcs({
      ...(await options()),
      path: { token },
    }).unwrap();
  } catch (error) {
    return nullOn404(error);
  }
}
