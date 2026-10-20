"use server";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { bookingPublicCreateSchema } from "@barrelsgd/api-client";
import { env } from "@/env";
import { createBooking, getAvailability } from "@/lib/booking-api";
import { type Failure, failureFrom, type Outcome } from "@/lib/booking-errors";

// Server Actions are the only door from the browser to the API: the API
// address never leaves the server, and the generated client does the calling.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9-]{16,100}$/;

export interface SlotChoice {
  ends_at: string;
  starts_at: string;
}

export interface SlotList {
  slots: SlotChoice[];
  timezone: string;
}

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

export interface Booked {
  booking: BookingPublicDetail;
  manageToken: string;
}

const invalid: Failure = {
  ok: false,
  code: "invalid",
  message:
    "Some details were not accepted. Please check the form and try again.",
};

const switchedOff: Failure = {
  ok: false,
  code: "not_found",
  message: "Online booking is not available right now.",
};

export async function loadSlots(
  serviceId: string,
  firstDay: string
): Promise<Outcome<SlotList>> {
  if (env.BABYDOLL_ONLINE_BOOKING !== "on") {
    return switchedOff;
  }
  if (!(UUID.test(serviceId) && DAY.test(firstDay))) {
    return invalid;
  }
  try {
    const result = await getAvailability(serviceId, firstDay);
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
  input: BookingInput
): Promise<Outcome<Booked>> {
  if (env.BABYDOLL_ONLINE_BOOKING !== "on") {
    return switchedOff;
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
