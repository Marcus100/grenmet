import { ResponseError } from "@barrelsgd/api-client";

export type FailureCode =
  | "slot_taken"
  | "cutoff"
  | "conflict"
  | "not_found"
  | "verification"
  | "rate_limited"
  | "invalid"
  | "unavailable";

export interface Failure {
  code: FailureCode;
  message: string;
  ok: false;
}

export interface Success<T> {
  data: T;
  ok: true;
}

export type Outcome<T> = Success<T> | Failure;

export type BookingAction = "read" | "create" | "cancel" | "reschedule";

/** Text of the API's 409 for a slot another customer took (bookings/public.py). */
const SLOT_TAKEN_MARK = "no longer available";
/** Text of the API's 409 inside the cancellation cutoff. */
const CUTOFF_MARK = "hours before they start";

function failure(code: FailureCode, message: string): Failure {
  return { ok: false, code, message };
}

/** The API's `{ "detail": "..." }` text, when it sent one. */
export function detailOf(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const { detail } = data;
    return typeof detail === "string" ? detail : undefined;
  }
}

/** Maps an API status to a message a customer can act on. */
export function classifyFailure(
  status: number,
  detail: string | undefined,
  action: BookingAction
): Failure {
  if (status === 409) {
    if (detail?.includes(SLOT_TAKEN_MARK)) {
      return failure(
        "slot_taken",
        "That time has just been taken. Please choose another."
      );
    }
    if (detail?.includes(CUTOFF_MARK)) {
      return failure("cutoff", detail);
    }
    if (action === "create") {
      return failure(
        "conflict",
        "This request no longer matches your earlier attempt. Please reload the page and try again."
      );
    }
    return failure(
      "conflict",
      detail ?? "This booking can no longer be changed online."
    );
  }
  if (status === 404) {
    return failure(
      "not_found",
      action === "create" || action === "read"
        ? "We couldn't find that. The link may have expired, or online booking is not available right now."
        : "We couldn't find this booking. The link may have expired."
    );
  }
  if (status === 429) {
    return failure(
      "rate_limited",
      "Too many attempts. Please wait a minute and try again."
    );
  }
  if ((status === 400 || status === 403) && action === "create") {
    return failure(
      "verification",
      "We couldn't verify the request. Please try again."
    );
  }
  if (status === 422 || status === 400) {
    return failure(
      "invalid",
      "Some details were not accepted. Please check the form and try again."
    );
  }
  return failure(
    "unavailable",
    "Booking is unavailable right now. Please try again shortly, or message us on Instagram."
  );
}

/**
 * Turns an API error into a failure. Anything that is not an API response
 * (a network fault, a bug) is rethrown so it reaches `error.tsx`, or the
 * caller's own retry handling.
 */
export function failureFrom(error: unknown, action: BookingAction): Failure {
  if (error instanceof ResponseError) {
    return classifyFailure(error.status, detailOf(error.data), action);
  }
  throw error;
}
