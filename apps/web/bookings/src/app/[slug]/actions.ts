"use server";

import { bookingPublicCreateSchema } from "@barrelsgd/api-client";
import type {
  Failure,
  Outcome,
} from "@barrelsgd/bookings-web/lib/booking-errors";
import type {
  Booked,
  BookingInput,
  SlotList,
} from "@barrelsgd/bookings-web/lib/booking-types";
import { createBooking, getAvailability } from "@/lib/booking-api";
import { failureFrom } from "@/lib/booking-errors";
import { isBusinessSlug } from "@/lib/slug";

// Server Actions are the only door from the browser to the API: the API
// address never leaves the server, and the generated client does the calling.
// The page binds the business slug as the first argument (`action.bind(null,
// slug)`), so the browser calls the shape the booking package expects. The slug
// is still untrusted input and is checked here.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9-]{16,100}$/;

const invalid: Failure = {
  ok: false,
  code: "invalid",
  message:
    "Some details were not accepted. Please check the form and try again.",
};

const unknownBusiness: Failure = {
  ok: false,
  code: "not_found",
  message: "Online booking is not available for this business right now.",
};

export async function loadSlots(
  slug: string,
  serviceId: string,
  firstDay: string
): Promise<Outcome<SlotList>> {
  if (!isBusinessSlug(slug)) {
    return unknownBusiness;
  }
  if (!(UUID.test(serviceId) && DAY.test(firstDay))) {
    return invalid;
  }
  try {
    const result = await getAvailability(slug, serviceId, firstDay);
    return {
      ok: true,
      data: {
        timezone: result.timezone,
        slots: result.slots.map(({ starts_at, ends_at }) => ({
          starts_at,
          ends_at,
        })),
      },
    };
  } catch (error) {
    return failureFrom(error, "read");
  }
}

export async function submitBooking(
  slug: string,
  input: BookingInput
): Promise<Outcome<Booked>> {
  if (!isBusinessSlug(slug)) {
    return unknownBusiness;
  }
  const phone = input.phone.trim();
  const notes = input.notes.trim();
  const website = input.website.trim();
  const turnstile = input.turnstileToken.trim();
  const body = bookingPublicCreateSchema.safeParse({
    service_id: input.serviceId,
    starts_at: input.startsAt,
    customer_name: input.name.trim(),
    customer_email: input.email.trim(),
    marketing_consent: input.marketingConsent,
    ...(phone ? { customer_phone: phone } : {}),
    ...(notes ? { notes } : {}),
    ...(turnstile ? { turnstile_token: turnstile } : {}),
    // The honeypot goes through untouched: a filled one is dropped by the API.
    ...(website ? { website } : {}),
  });
  if (!(body.success && KEY.test(input.idempotencyKey))) {
    return invalid;
  }
  try {
    const receipt = await createBooking(
      slug,
      {
        service_id: body.data.service_id,
        starts_at: body.data.starts_at,
        customer_name: body.data.customer_name,
        customer_email: body.data.customer_email,
        marketing_consent: body.data.marketing_consent,
        ...(body.data.customer_phone
          ? { customer_phone: body.data.customer_phone }
          : {}),
        ...(body.data.notes ? { notes: body.data.notes } : {}),
        ...(body.data.turnstile_token
          ? { turnstile_token: body.data.turnstile_token }
          : {}),
        ...(body.data.website ? { website: body.data.website } : {}),
      },
      input.idempotencyKey
    );
    return {
      ok: true,
      data: { booking: receipt.booking, manageToken: receipt.manage_token },
    };
  } catch (error) {
    return failureFrom(error, "create");
  }
}
