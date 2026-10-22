"use server";

import {
  bookingEmailCodeConfirmSchema,
  bookingEmailCodeRequestSchema,
  bookingPublicCreateSchema,
} from "@barrelsgd/api-client";
import type {
  Failure,
  Outcome,
} from "@barrelsgd/bookings-web/lib/booking-errors";
import type {
  Booked,
  BookingInput,
  EmailCodeConfirmInput,
  EmailCodeRequestInput,
  EmailCodeSent,
  EmailProof,
  SlotList,
} from "@barrelsgd/bookings-web/lib/booking-types";
import { env } from "@/env";
import {
  confirmEmailCode as confirmCode,
  createBooking,
  getAvailability,
  requestEmailCode as requestCode,
} from "@/lib/booking-api";
import { failureFrom } from "@/lib/booking-errors";

// Server Actions are the only door from the browser to the API: the API
// address never leaves the server, and the generated client does the calling.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9-]{16,100}$/;

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

// Server Action arguments come from the browser and are not guaranteed to
// match their TypeScript types: never call a string method on them unchecked.
function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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
  if (typeof input !== "object" || input === null) {
    return invalid;
  }
  const phone = trimmed(input.phone);
  const notes = trimmed(input.notes);
  const website = trimmed(input.website);
  const turnstile = trimmed(input.turnstileToken);
  const body = bookingPublicCreateSchema.safeParse({
    service_id: input.serviceId,
    starts_at: input.startsAt,
    customer_name: trimmed(input.name),
    customer_email: trimmed(input.email),
    marketing_consent: input.marketingConsent,
    ...(phone ? { customer_phone: phone } : {}),
    ...(notes ? { notes } : {}),
    ...(turnstile ? { turnstile_token: turnstile } : {}),
    // The honeypot goes through untouched: a filled one is dropped by the API.
    ...(website ? { website } : {}),
    ...(input.emailProof ? { email_proof: input.emailProof } : {}),
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
        ...(body.data.email_proof
          ? { email_proof: body.data.email_proof }
          : {}),
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

export async function requestEmailCode(
  input: EmailCodeRequestInput
): Promise<Outcome<EmailCodeSent>> {
  if (env.BABYDOLL_ONLINE_BOOKING !== "on") {
    return switchedOff;
  }
  if (typeof input !== "object" || input === null) {
    return invalid;
  }
  const turnstile = trimmed(input.turnstileToken);
  const body = bookingEmailCodeRequestSchema.safeParse({
    service_id: input.serviceId,
    starts_at: input.startsAt,
    customer_email: trimmed(input.email),
    ...(turnstile ? { turnstile_token: turnstile } : {}),
  });
  if (!body.success) {
    return invalid;
  }
  try {
    const sent = await requestCode({
      service_id: body.data.service_id,
      starts_at: body.data.starts_at,
      customer_email: body.data.customer_email,
      ...(body.data.turnstile_token
        ? { turnstile_token: body.data.turnstile_token }
        : {}),
    });
    return {
      ok: true,
      data: {
        required: sent.required,
        expiresInSeconds: sent.expires_in_seconds ?? 0,
      },
    };
  } catch (error) {
    return failureFrom(error, "email-code");
  }
}

export async function confirmEmailCode(
  input: EmailCodeConfirmInput
): Promise<Outcome<EmailProof>> {
  if (env.BABYDOLL_ONLINE_BOOKING !== "on") {
    return switchedOff;
  }
  if (typeof input !== "object" || input === null) {
    return invalid;
  }
  const body = bookingEmailCodeConfirmSchema.safeParse({
    service_id: input.serviceId,
    starts_at: input.startsAt,
    customer_email: trimmed(input.email),
    code: trimmed(input.code),
  });
  if (!body.success) {
    return invalid;
  }
  try {
    const proof = await confirmCode(body.data);
    return {
      ok: true,
      data: { proof: proof.proof, expiresInSeconds: proof.expires_in_seconds },
    };
  } catch (error) {
    return failureFrom(error, "email-confirm");
  }
}
