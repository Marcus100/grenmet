// Whether a manage link still points at a booking, asked by the proxy before
// the page renders. Server only: it reads the server-only API address.
//
// The token is a secret, so nothing here keeps it: no cache, no log, and the
// answer is a bare boolean.

import "server-only";

import {
  bookingsGetPublicBooking,
  createClient,
  ResponseError,
} from "@barrelsgd/api-client";
import { env } from "@/env";
import { visitorHeaders } from "@/lib/visitor-headers";

interface HeaderReader {
  get: (name: string) => string | null;
}

/** The API gets this long to answer before the page is left to decide. */
export const BOOKING_LINK_TIMEOUT_MS = 3000;

/**
 * True when the API knows the token, false when it says there is no such
 * booking (404, or 422 for a token it cannot read), and null when it could not
 * answer in time: the page then makes the call itself and decides.
 */
export async function bookingLinkExists(
  token: string,
  incoming: HeaderReader
): Promise<boolean | null> {
  try {
    await bookingsGetPublicBooking({
      client: createClient({
        baseURL: env.AUTH_API_URL,
        // Rate limits key on the visitor, as for the page's own call.
        headers: visitorHeaders(
          incoming,
          env.TRUSTED_WEB_SECRET,
          env.VISITOR_IP_PROXY_HOPS
        ),
      }),
      path: { token },
      signal: AbortSignal.timeout(BOOKING_LINK_TIMEOUT_MS),
    }).unwrap();
    return true;
  } catch (error) {
    if (
      error instanceof ResponseError &&
      (error.status === 404 || error.status === 422)
    ) {
      return false;
    }
    return null;
  }
}
