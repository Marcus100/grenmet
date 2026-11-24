import "server-only";

import type { BookingAgenda } from "@barrelsgd/api-client";
import { addDays } from "@barrelsgd/bookings-web/lib/booking-format";
import { cache } from "react";
import { getAgenda } from "@/lib/studio-api";
import { todayIn } from "@/lib/studio-view";

/** The agenda API answers at most 62 days: two weeks back, today and 47 days ahead. */
const DAYS_BACK = 14;
const DAYS_AHEAD = 47;
const LIMIT = 100;

/**
 * Bookings waiting for the business to confirm (`pending`; "awaiting deposit"
 * waits for the customer, not the business). Cached per request so the shell's
 * count and the agenda's list come from one call.
 */
export const loadPendingRequests = cache(
  (
    accessToken: string,
    organisationId: string,
    timezone: string
  ): Promise<BookingAgenda> => {
    const today = todayIn(timezone);
    return getAgenda(accessToken, organisationId, {
      fromDate: addDays(today, -DAYS_BACK),
      toDate: addDays(today, DAYS_AHEAD),
      limit: LIMIT,
      statuses: ["pending"],
    });
  }
);
