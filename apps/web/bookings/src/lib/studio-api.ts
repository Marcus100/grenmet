// Server-side reads for the studio, through the generated client. Import only
// from Server Components: every call carries the signed-in person's bearer
// token, and organisation calls name the organisation in
// `X-Barrels-Organisation`. FastAPI re-checks membership and role on each call.
// Reads, plus the booking actions (confirm, decline, cancel, no-show, complete).

import "server-only";

import {
  type BookingAgenda,
  type BookingMyOrganisation,
  type BookingProfilePublic,
  type BookingProfileUpdate,
  type BookingProviderCreate,
  type BookingProviderPublic,
  type BookingProviderUpdate,
  type BookingServiceCreate,
  type BookingServicePublic,
  type BookingServiceUpdate,
  type BookingSettings,
  type BookingStatus,
  type BookingStudioCreate,
  type BookingStudioDetail,
  type BookingWorkingPeriodIn,
  type BookingWorkingPeriodPublic,
  bookingsCancelStudioBooking,
  bookingsCompleteStudioBooking,
  bookingsConfirmStudioBooking,
  bookingsCreateProvider,
  bookingsCreateService,
  bookingsCreateStudioBooking,
  bookingsDeclineStudioBooking,
  bookingsGetAgenda,
  bookingsGetProfile,
  bookingsGetSettings,
  bookingsGetStudioBooking,
  bookingsListMyOrganisations,
  bookingsListProviders,
  bookingsListServices,
  bookingsNoShowStudioBooking,
  bookingsRecordManualDeposit,
  bookingsReplaceWorkingHours,
  bookingsUpdateProvider,
  bookingsUpdateService,
  bookingsUpsertProfile,
  createClient,
  type ManualMethod,
  ResponseError,
} from "@barrelsgd/api-client";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";
import { redactRequest } from "@/lib/redact-request";
import { DEFAULT_TIMEZONE } from "@/lib/studio-view";

const API_PREFIX = /\/api\/v1(?=\/|$)/u;
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

/** The business's services, for the new-booking form. */
export function listServices(
  accessToken: string,
  organisationId: string
): Promise<BookingServicePublic[]> {
  return bookingsListServices({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/**
 * The business's own timezone from its booking profile, so "today" is the day
 * on the business's calendar. A business without a profile yet has no zone
 * (404); it falls back to the default instead of failing the page.
 */
export async function getBusinessTimezone(
  accessToken: string,
  organisationId: string
): Promise<string> {
  try {
    const profile = await bookingsGetProfile({
      client: studioClient(accessToken, organisationId),
    })
      .unwrap()
      .catch(redactRequest);
    return profile.timezone ?? DEFAULT_TIMEZONE;
  } catch (error) {
    if (ResponseError.is(error) && error.status === 404) {
      return DEFAULT_TIMEZONE;
    }
    throw error;
  }
}

/** Enters a phone or walk-in booking. The key makes a retry safe. */
export function createStudioBooking(
  accessToken: string,
  organisationId: string,
  idempotencyKey: string,
  body: BookingStudioCreate
): Promise<BookingStudioDetail> {
  return bookingsCreateStudioBooking({
    client: studioClient(accessToken, organisationId),
    headers: { "Idempotency-Key": idempotencyKey },
    body,
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

// --- actions -----------------------------------------------------------------
// Each returns the updated booking. FastAPI decides role and legal transitions
// and answers 403 / 409; callers turn those into messages (studio-errors.ts).

function actionTarget(
  accessToken: string,
  organisationId: string,
  bookingId: string
) {
  return {
    client: studioClient(accessToken, organisationId),
    path: { booking_id: bookingId },
  };
}

export function confirmBooking(
  accessToken: string,
  organisationId: string,
  bookingId: string
): Promise<BookingStudioDetail> {
  return bookingsConfirmStudioBooking(
    actionTarget(accessToken, organisationId, bookingId)
  )
    .unwrap()
    .catch(redactRequest);
}

export function declineBooking(
  accessToken: string,
  organisationId: string,
  bookingId: string,
  reason: string
): Promise<BookingStudioDetail> {
  return bookingsDeclineStudioBooking({
    ...actionTarget(accessToken, organisationId, bookingId),
    body: { reason },
  })
    .unwrap()
    .catch(redactRequest);
}

export function cancelBooking(
  accessToken: string,
  organisationId: string,
  bookingId: string,
  input: { reason: string; refundDeposit?: boolean }
): Promise<BookingStudioDetail> {
  return bookingsCancelStudioBooking({
    ...actionTarget(accessToken, organisationId, bookingId),
    body: {
      reason: input.reason,
      ...(input.refundDeposit === undefined
        ? {}
        : { refund_deposit: input.refundDeposit }),
    },
  })
    .unwrap()
    .catch(redactRequest);
}

export function markNoShow(
  accessToken: string,
  organisationId: string,
  bookingId: string
): Promise<BookingStudioDetail> {
  return bookingsNoShowStudioBooking(
    actionTarget(accessToken, organisationId, bookingId)
  )
    .unwrap()
    .catch(redactRequest);
}

export function markCompleted(
  accessToken: string,
  organisationId: string,
  bookingId: string
): Promise<BookingStudioDetail> {
  return bookingsCompleteStudioBooking(
    actionTarget(accessToken, organisationId, bookingId)
  )
    .unwrap()
    .catch(redactRequest);
}

/**
 * Records a deposit taken outside Stripe. The key makes a retry safe: the same
 * key and body replays the first answer instead of recording twice.
 */
export function recordManualDeposit(
  accessToken: string,
  organisationId: string,
  bookingId: string,
  idempotencyKey: string,
  input: { method: ManualMethod; reference?: string }
): Promise<BookingStudioDetail> {
  return bookingsRecordManualDeposit({
    ...actionTarget(accessToken, organisationId, bookingId),
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      method: input.method,
      ...(input.reference ? { reference: input.reference } : {}),
    },
  })
    .unwrap()
    .catch(redactRequest);
}

// --- settings ----------------------------------------------------------------
// Owners and admins change them; FastAPI answers 403 to anyone else.

/** Profile, services, providers with hours, and whether deposits are collected. */
export function getSettings(
  accessToken: string,
  organisationId: string
): Promise<BookingSettings> {
  return bookingsGetSettings({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/** Creates or replaces the whole booking profile (the API's PUT has no partial form). */
export function saveProfile(
  accessToken: string,
  organisationId: string,
  body: BookingProfileUpdate
): Promise<BookingProfilePublic> {
  return bookingsUpsertProfile({
    client: studioClient(accessToken, organisationId),
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

export function createService(
  accessToken: string,
  organisationId: string,
  body: BookingServiceCreate
): Promise<BookingServicePublic> {
  return bookingsCreateService({
    client: studioClient(accessToken, organisationId),
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

export function updateService(
  accessToken: string,
  organisationId: string,
  serviceId: string,
  body: BookingServiceUpdate
): Promise<BookingServicePublic> {
  return bookingsUpdateService({
    client: studioClient(accessToken, organisationId),
    path: { service_id: serviceId },
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

export function createProvider(
  accessToken: string,
  organisationId: string,
  body: BookingProviderCreate
): Promise<BookingProviderPublic> {
  return bookingsCreateProvider({
    client: studioClient(accessToken, organisationId),
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

export function updateProvider(
  accessToken: string,
  organisationId: string,
  providerId: string,
  body: BookingProviderUpdate
): Promise<BookingProviderPublic> {
  return bookingsUpdateProvider({
    client: studioClient(accessToken, organisationId),
    path: { provider_id: providerId },
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

/** Replaces a provider's whole week; no periods on a day is a day off. */
export function replaceHours(
  accessToken: string,
  organisationId: string,
  providerId: string,
  periods: BookingWorkingPeriodIn[]
): Promise<BookingWorkingPeriodPublic[]> {
  return bookingsReplaceWorkingHours({
    client: studioClient(accessToken, organisationId),
    path: { provider_id: providerId },
    body: { periods },
  })
    .unwrap()
    .catch(redactRequest);
}
