// Server-side reads for the studio, through the generated client. Import only
// from Server Components: every call carries the signed-in person's bearer
// token, and organisation calls name the organisation in
// `X-Barrels-Organisation`. FastAPI re-checks membership and role on each call.
// Read-only in this slice: no writes live here.

import "server-only";

import {
  type BookingAgenda,
  type BookingMyOrganisation,
  type BookingProviderPublic,
  type BookingStatus,
  type BookingStudioDetail,
  bookingsGetAgenda,
  bookingsGetStudioBooking,
  bookingsListMyOrganisations,
  bookingsListProviders,
  createClient,
  ResponseError,
} from "@barrelsgd/api-client";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";
import { redactRequest } from "@/lib/redact-request";

const API_PREFIX = /\/api\/v1(?=\/|$)/;
const TIMEOUT_MS = 10_000;

function studioClient(accessToken: string, organisationId?: string) {
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(organisationId ? { "X-Barrels-Organisation": organisationId } : {}),
    },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }));
  return client;
}

/** Organisations the person belongs to with a role that can use bookings. */
export const listMyOrganisations = cache(
  (accessToken: string): Promise<BookingMyOrganisation[]> =>
    bookingsListMyOrganisations({ client: studioClient(accessToken) })
      .unwrap()
      .catch(redactRequest)
);

/**
 * The organisation behind a URL slug, taken from the person's own list. The id
 * is never read from the URL, so a guessed slug for another business is null.
 */
export async function findOrganisation(
  accessToken: string,
  slug: string
): Promise<BookingMyOrganisation | null> {
  const organisations = await listMyOrganisations(accessToken);
  return organisations.find((item) => item.slug === slug) ?? null;
}

export interface AgendaQuery {
  fromDate: string;
  limit?: number;
  offset?: number;
  providerId?: string;
  statuses?: BookingStatus[];
  toDate: string;
}

export function getAgenda(
  accessToken: string,
  organisationId: string,
  query: AgendaQuery
): Promise<BookingAgenda> {
  return bookingsGetAgenda({
    client: studioClient(accessToken, organisationId),
    query: {
      from_date: query.fromDate,
      to_date: query.toDate,
      limit: query.limit ?? 500,
      offset: query.offset ?? 0,
      ...(query.providerId ? { provider_id: query.providerId } : {}),
      ...(query.statuses?.length ? { status: query.statuses } : {}),
    },
  })
    .unwrap()
    .catch(redactRequest);
}

/** The business's providers, for the agenda filter and names. */
export function listProviders(
  accessToken: string,
  organisationId: string
): Promise<BookingProviderPublic[]> {
  return bookingsListProviders({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/** One booking with customer and timeline; null for an unknown id. */
export async function getBooking(
  accessToken: string,
  organisationId: string,
  bookingId: string
): Promise<BookingStudioDetail | null> {
  try {
    return await bookingsGetStudioBooking({
      client: studioClient(accessToken, organisationId),
      path: { booking_id: bookingId },
    })
      .unwrap()
      .catch(redactRequest);
  } catch (error) {
    if (
      ResponseError.is(error) &&
      (error.status === 404 || error.status === 422)
    ) {
      return null;
    }
    throw error;
  }
}
