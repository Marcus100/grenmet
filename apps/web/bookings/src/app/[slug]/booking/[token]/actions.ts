"use server";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import type {
  Failure,
  Outcome,
} from "@barrelsgd/bookings-web/lib/booking-errors";
import type { SlotList } from "@barrelsgd/bookings-web/lib/booking-types";
import {
  cancelBooking,
  getAvailability,
  getBooking,
  rescheduleBooking,
} from "@/lib/booking-api";
import { failureFrom } from "@/lib/booking-errors";
import { isBusinessSlug } from "@/lib/slug";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/u;

const invalid: Failure = {
  ok: false,
  code: "invalid",
  message: "That time was not accepted. Please choose another.",
};

const gone: Failure = {
  ok: false,
  code: "not_found",
  message: "We couldn't find this booking. The link may have expired.",
};

/**
 * Open slots for the same service and provider as the booking. The page binds
 * the business slug as the first argument.
 */
export async function loadRescheduleSlots(
  slug: string,
  token: string,
  firstDay: string
): Promise<Outcome<SlotList>> {
  if (!(isBusinessSlug(slug) && DAY.test(firstDay))) {
    return invalid;
  }
  try {
    // The service and provider come from the booking itself, not the browser.
    const booking = await getBooking(token);
    if (!booking) {
      return gone;
    }
    const result = await getAvailability(
      slug,
      booking.service_id,
      firstDay,
      booking.provider_id
    );
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

export async function cancelMyBooking(
  token: string
): Promise<Outcome<BookingPublicDetail>> {
  try {
    return { ok: true, data: await cancelBooking(token) };
  } catch (error) {
    return failureFrom(error, "cancel");
  }
}

export async function rescheduleMyBooking(
  token: string,
  startsAt: string
): Promise<Outcome<BookingPublicDetail>> {
  if (!INSTANT.test(startsAt)) {
    return invalid;
  }
  try {
    return { ok: true, data: await rescheduleBooking(token, startsAt) };
  } catch (error) {
    return failureFrom(error, "reschedule");
  }
}
