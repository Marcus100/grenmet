import "server-only";

import type { BookingAgenda } from "@barrelsgd/api-client";
import { addDays } from "@barrelsgd/bookings-web/lib/booking-format";
import { cache } from "react";
import { getAgenda, getBusinessProfile } from "@/lib/studio-api";
import { todayIn } from "@/lib/studio-view";

/**
 * The agenda API answers at most 62 days per call. Two calls cover what the
 * block says: the next 6 weeks (plus two weeks back) and, before that, the
 * 62 days older still, so a request left unanswered for weeks is not lost.
 */
const RECENT_BACK = 14;
const AHEAD = 47;
const OLDER_BACK = 76;
const LIMIT = 100;

/** The business profile, read once per request for the shell and the page. */
export const loadBusinessProfile = cache(
  (accessToken: string, organisationId: string) =>
    getBusinessProfile(accessToken, organisationId)
);

/** Two pending reads joined into one agenda: older days first, totals added. */
export function joinAgendas(
  older: BookingAgenda,
  recent: BookingAgenda
): BookingAgenda {
  return {
    ...recent,
    from_date: older.from_date,
    total: older.total + recent.total,
    days: [...older.days, ...recent.days],
  };
}

/**
 * Bookings waiting for the business to confirm (`pending`; "awaiting deposit"
 * waits for the customer, not the business). Cached per request so the shell's
 * count and the agenda's list come from one pair of calls.
 */
export const loadPendingRequests = cache(
  async (
    accessToken: string,
    organisationId: string,
    timezone: string
  ): Promise<BookingAgenda> => {
    const today = todayIn(timezone);
    const read = (fromDate: string, toDate: string) =>
      getAgenda(accessToken, organisationId, {
        fromDate,
        toDate,
        limit: LIMIT,
        statuses: ["pending"],
      });
    const [older, recent] = await Promise.all([
      read(addDays(today, -OLDER_BACK), addDays(today, -RECENT_BACK - 1)),
      read(addDays(today, -RECENT_BACK), addDays(today, AHEAD)),
    ]);
    return joinAgendas(older, recent);
  }
);
