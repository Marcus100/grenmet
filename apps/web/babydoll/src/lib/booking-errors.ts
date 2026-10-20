// The app's side of booking failures: turns the generated client's errors into
// the package's Failure results. Only Server-side code (actions, pages) uses it.

import { ResponseError } from "@barrelsgd/api-client";
import {
  type BookingAction,
  classifyFailure,
  detailOf,
  type Failure,
} from "@barrelsgd/bookings-web/lib/booking-errors";
import { BOOKING_CONTACT } from "@/data/site";

/**
 * Turns an API error into a failure. Anything that is not an API response
 * (a network fault, a bug) is rethrown so it reaches `error.tsx`, or the
 * caller's own retry handling.
 */
export function failureFrom(error: unknown, action: BookingAction): Failure {
  if (error instanceof ResponseError) {
    return classifyFailure(
      error.status,
      detailOf(error.data),
      action,
      BOOKING_CONTACT.label
    );
  }
  throw error;
}
