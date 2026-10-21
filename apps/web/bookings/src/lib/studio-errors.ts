// The studio's side of API failures: turns the generated client's errors into
// a message a staff member can act on. Anything that is not an API response
// (a network fault, a bug) is rethrown so it reaches `error.tsx`.

import { ResponseError } from "@barrelsgd/api-client";

export type StudioFailureKind =
  | "signed_out"
  | "forbidden"
  | "not_found"
  | "invalid"
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
