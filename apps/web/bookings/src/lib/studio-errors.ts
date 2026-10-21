// The studio's side of API failures: turns the generated client's errors into
// a message a staff member can act on. Anything that is not an API response
// (a network fault, a bug) is rethrown so it reaches `error.tsx`.

import { ResponseError } from "@barrelsgd/api-client";

export type StudioFailureKind =
  | "signed_out"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "unavailable";

export interface StudioFailure {
  kind: StudioFailureKind;
  message: string;
  /** What to do next, shown beside the message. */
  nextStep: string;
}

export function studioFailure(error: unknown): StudioFailure {
  if (!ResponseError.is(error)) {
    throw error;
  }
  switch (error.status) {
    case 401:
      return {
        kind: "signed_out",
        message: "Your session has ended.",
        nextStep: "Sign in again to continue.",
      };
    case 403:
      return {
        kind: "forbidden",
        message: "You are not a member of this business.",
        nextStep: "Ask the business owner to invite you, then try again.",
      };
    case 404:
      return {
        kind: "not_found",
        message: "We could not find that.",
        nextStep: "Go back to the agenda and choose again.",
      };
    case 400:
    case 422:
      return {
        kind: "invalid",
        message: "That date range or filter is not valid.",
        nextStep: "Choose another day, or clear the provider filter.",
      };
    default:
      return {
        kind: "unavailable",
        message: "The agenda is not available right now.",
        nextStep: "Try again in a moment.",
      };
  }
}

/** A member (not an admin) tried to change a booking. */
export const ADMIN_REQUIRED: StudioFailure = {
  kind: "forbidden",
  message: "You need admin access to change bookings.",
  nextStep: "Ask the business owner to make you an admin, then try again.",
};

/**
 * Failures of a booking action (confirm, decline, cancel, no-show, complete).
 * A 403 here means the person is a member but not an admin; a 409 means the
 * booking changed under them, so the page is refreshed and says so.
 */
export function actionFailure(error: unknown): StudioFailure {
  const unavailable: StudioFailure = {
    kind: "unavailable",
    message: "We could not save that change.",
    nextStep: "Try again in a moment.",
  };
  if (!ResponseError.is(error)) {
    return unavailable;
  }
  switch (error.status) {
    case 403:
      return ADMIN_REQUIRED;
    case 409:
      return {
        kind: "conflict",
        message: "This booking cannot be changed that way.",
        nextStep:
          "It was updated by someone else, or the time is no longer free. The page has refreshed; check its status and try again.",
      };
    case 400:
    case 422:
      return {
        kind: "invalid",
        message: "That change was not accepted.",
        nextStep: "Check the reason and try again.",
      };
    case 401:
    case 404:
      return studioFailure(error);
    default:
      return unavailable;
  }
}
