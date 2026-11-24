// The home page's business list, from the public API through the generated
// client. Server only: it reads the server-side API address and the visitor
// headers. The visitor's own address travels with the call, so the API's rate
// limit (60 a minute) counts each visitor, not this server.

import "server-only";

import {
  type BookingPublicBusinessPage,
  bookingsListPublicBusinesses,
  createClient,
} from "@barrelsgd/api-client";
import { headers } from "next/headers";
import { env } from "@/env";
import type { ListingQuery } from "@/lib/business-listing-query";
import { redactRequest } from "@/lib/redact-request";
import { reportError } from "@/lib/report-error";
import { visitorHeaders } from "@/lib/visitor-headers";

/**
 * One page of businesses that opted in. Null when the list cannot be loaded
 * right now; the failure is reported and the page says so, instead of failing.
 */
export async function getPublicBusinesses(
  query: ListingQuery
): Promise<BookingPublicBusinessPage | null> {
  try {
    const client = createClient({
      baseURL: env.AUTH_API_URL,
      headers: visitorHeaders(
        await headers(),
        env.TRUSTED_WEB_SECRET,
        env.VISITOR_IP_PROXY_HOPS
      ),
    });
    return await bookingsListPublicBusinesses({
      client,
      query: {
        q: query.q,
        category: query.category,
        type: query.type,
        page: query.page,
      },
    })
      .unwrap()
      .catch(redactRequest);
  } catch (error) {
    reportError(error, "bookings-home");
    return null;
  }
}
