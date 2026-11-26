// Server-side reads for the studio, through the generated client. Import only
// from Server Components: every call carries the signed-in person's bearer
// token, and organisation calls name the organisation in
// `X-Barrels-Organisation`. FastAPI re-checks membership and role on each call.
// Reads, plus the booking actions (confirm, decline, cancel, no-show, complete).

import "server-only";

import {
  type AppSubscriptionCheckoutPublic,
  type AppSubscriptionListPublic,
  type BookingAgenda,
  type BookingCalendarFeedLink,
  type BookingCalendarFeedStatus,
  type BookingExceptionCreate,
  type BookingExceptionPublic,
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
  billingCreateAppSubscriptionCheckout,
  billingListAppSubscriptions,
  bookingsCancelStudioBooking,
  bookingsCompleteStudioBooking,
  bookingsConfirmStudioBooking,
  bookingsCreateCalendarFeed,
  bookingsCreateException,
  bookingsCreateProvider,
  bookingsCreateService,
  bookingsCreateStudioBooking,
  bookingsDeclineStudioBooking,
  bookingsDeleteException,
  bookingsGetAgenda,
  bookingsGetCalendarFeedStatus,
  bookingsGetProfile,
  bookingsGetSettings,
  bookingsGetStudioBooking,
  bookingsListExceptions,
  bookingsListMyOrganisations,
  bookingsListProviders,
  bookingsListServices,
  bookingsNoShowStudioBooking,
  bookingsRecordManualDeposit,
  bookingsReplaceWorkingHours,
  bookingsRescheduleStudioBooking,
  bookingsRotateCalendarFeed,
  bookingsUpdateProvider,
  bookingsUpdateService,
  bookingsUpsertProfile,
  createClient,
  type ManualMethod,
  ResponseError,
  type StoredFile,
  storageCompleteUpload,
  storageCreateUpload,
  type UploadTicket,
} from "@barrelsgd/api-client";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";
import { redactRequest } from "@/lib/redact-request";
import { DEFAULT_TIMEZONE } from "@/lib/studio-view";

/** Used only when the business has no profile yet; matches the Settings page. */
const DEFAULT_CURRENCY = "XCD";
const LOGO_PURPOSE = "booking-logo";
const COVER_PURPOSE = "booking-cover";
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

/**
 * The organisation's Barrels app subscriptions (ADR-0065), newest first. The list
 * also holds other apps' rows, so callers pick their own app. The whole body is
 * returned: `purchasable` lists the `plan_key:currency` pairs a checkout can start
 * now (empty until billing is configured). Organisation admins and owners only
 * (FastAPI decides).
 */
export function listAppSubscriptions(
  accessToken: string,
  organisationId: string
): Promise<AppSubscriptionListPublic> {
  return billingListAppSubscriptions({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/**
 * Starts (or resumes, while the Checkout is open) the plan's hosted Checkout and
 * returns its URL. The caller redirects; this never follows the link itself.
 */
export function startAppSubscriptionCheckout(
  accessToken: string,
  organisationId: string,
  planKey: string
): Promise<AppSubscriptionCheckoutPublic> {
  return billingCreateAppSubscriptionCheckout({
    body: { plan_key: planKey, currency: "XCD" },
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
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
 * The business's timezone, currency and public booking address (`publicSlug`,
 * the path customers use; it can differ from the studio slug) from its booking
 * profile: "today" is the day on the business's calendar, and prices show in
 * its currency. A business without a profile yet has none of them (404); the
 * defaults and a null address keep the page working instead of failing.
 */
export async function getBusinessProfile(
  accessToken: string,
  organisationId: string
): Promise<{ currency: string; timezone: string; publicSlug: string | null }> {
  const fallback = {
    currency: DEFAULT_CURRENCY,
    publicSlug: null,
    timezone: DEFAULT_TIMEZONE,
  };
  try {
    const profile = await bookingsGetProfile({
      client: studioClient(accessToken, organisationId),
    })
      .unwrap()
      .catch(redactRequest);
    return {
      currency: profile.currency ?? DEFAULT_CURRENCY,
      publicSlug: profile.public_slug || null,
      timezone: profile.timezone ?? DEFAULT_TIMEZONE,
    };
  } catch (error) {
    if (ResponseError.is(error) && error.status === 404) {
      return fallback;
    }
    throw error;
  }
}

export async function getBusinessTimezone(
  accessToken: string,
  organisationId: string
): Promise<string> {
  return (await getBusinessProfile(accessToken, organisationId)).timezone;
}

/**
 * The whole saved booking profile, or null when the business has none yet
 * (404). Section saves read it first: the API's profile write replaces every
 * field, so a section must send the stored values of the sections it leaves out.
 */
export async function getProfile(
  accessToken: string,
  organisationId: string
): Promise<BookingProfilePublic | null> {
  try {
    return await bookingsGetProfile({
      client: studioClient(accessToken, organisationId),
    })
      .unwrap()
      .catch(redactRequest);
  } catch (error) {
    if (ResponseError.is(error) && error.status === 404) {
      return null;
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

/** Moves a pending or confirmed booking to a new start (UTC ISO). */
export function rescheduleBooking(
  accessToken: string,
  organisationId: string,
  bookingId: string,
  startsAt: string
): Promise<BookingStudioDetail> {
  return bookingsRescheduleStudioBooking({
    ...actionTarget(accessToken, organisationId, bookingId),
    body: { starts_at: startsAt },
  })
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

/** Whether the business has a calendar feed (owners and admins only; no address). */
export function getCalendarFeedStatus(
  accessToken: string,
  organisationId: string
): Promise<BookingCalendarFeedStatus> {
  return bookingsGetCalendarFeedStatus({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/** Makes the calendar feed. The address comes back here and nowhere else. */
export function createCalendarFeed(
  accessToken: string,
  organisationId: string
): Promise<BookingCalendarFeedLink> {
  return bookingsCreateCalendarFeed({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/** Replaces the feed's address; the old one stops working at once. */
export function rotateCalendarFeed(
  accessToken: string,
  organisationId: string
): Promise<BookingCalendarFeedLink> {
  return bookingsRotateCalendarFeed({
    client: studioClient(accessToken, organisationId),
  })
    .unwrap()
    .catch(redactRequest);
}

/** Step 1 of a logo upload: a presigned PUT for a `booking-logo` of this business. */
export function createLogoUpload(
  accessToken: string,
  organisationId: string,
  body: { content_type: string; size_bytes: number }
): Promise<UploadTicket> {
  return storageCreateUpload({
    client: studioClient(accessToken, organisationId),
    body: { app: "bookings", purpose: LOGO_PURPOSE, ...body },
  })
    .unwrap()
    .catch(redactRequest);
}

/** Step 1 of a cover photo upload: a presigned PUT for a `booking-cover` of this business. */
export function createCoverUpload(
  accessToken: string,
  organisationId: string,
  body: { content_type: string; size_bytes: number }
): Promise<UploadTicket> {
  return storageCreateUpload({
    client: studioClient(accessToken, organisationId),
    body: { app: "bookings", purpose: COVER_PURPOSE, ...body },
  })
    .unwrap()
    .catch(redactRequest);
}

/**
 * Step 3 of a logo or cover photo upload: the API confirms the bytes arrived;
 * returns the file. (The confirm call is the same for every purpose.)
 */
export function completeLogoUpload(
  accessToken: string,
  organisationId: string,
  uploadId: string
): Promise<StoredFile> {
  return storageCompleteUpload({
    client: studioClient(accessToken, organisationId),
    path: { upload_id: uploadId },
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

// --- time off (provider exceptions) --------------------------------------------
// Time off blocks bookings and extra hours open times outside the weekly plan.
// The API has no update: a change is a delete and a new add.

/** One provider's time off and extra hours that end after `startsFrom` (ISO). */
export function listExceptions(
  accessToken: string,
  organisationId: string,
  providerId: string,
  startsFrom: string
): Promise<BookingExceptionPublic[]> {
  return bookingsListExceptions({
    client: studioClient(accessToken, organisationId),
    path: { provider_id: providerId },
    query: { starts_from: startsFrom },
  })
    .unwrap()
    .catch(redactRequest);
}

export function createException(
  accessToken: string,
  organisationId: string,
  providerId: string,
  body: BookingExceptionCreate
): Promise<BookingExceptionPublic> {
  return bookingsCreateException({
    client: studioClient(accessToken, organisationId),
    path: { provider_id: providerId },
    body,
  })
    .unwrap()
    .catch(redactRequest);
}

export function deleteException(
  accessToken: string,
  organisationId: string,
  exceptionId: string
): Promise<void> {
  return bookingsDeleteException({
    client: studioClient(accessToken, organisationId),
    path: { exception_id: exceptionId },
  })
    .unwrap()
    .then(() => undefined)
    .catch(redactRequest);
}
