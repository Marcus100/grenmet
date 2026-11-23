// The studio's side of plan and billing failures (ADR-0065). Turns the generated
// client's errors into a message a staff member can act on. Non-API errors are
// rethrown so they reach `error.tsx`, as in `studio-errors.ts`.
//
// A 401 is not sent to sign-in here: the billing routes can refuse a bookings
// session on their own, and a redirect would loop. It is reported instead.

import { ResponseError } from "@barrelsgd/api-client";
import type { StudioFailure } from "@/lib/studio-errors";

/** A member (not an owner or admin) opened or used the plan. Checked before any call. */
export const PLAN_ADMIN_REQUIRED: StudioFailure = {
  kind: "forbidden",
  message: "Only the business owner or an admin can manage the plan.",
  nextStep: "Ask the business owner to make you an admin, then try again.",
};

/** A failure from a billing call, worded for the person who made it. */
export function billingFailure(error: unknown): StudioFailure {
  if (!ResponseError.is(error)) {
    throw error;
  }
  switch (error.status) {
    case 401:
      return {
        kind: "unavailable",
        message: "We could not check this sign-in for the plan.",
        nextStep:
          "Sign out, sign in again, and reload. If it keeps happening, tell Barrels.",
      };
    case 403:
      return PLAN_ADMIN_REQUIRED;
    case 404:
      return {
        kind: "not_found",
        message: "We could not find that plan.",
        nextStep: "Reload the page. If it keeps happening, tell Barrels.",
      };
    case 409:
      return {
        kind: "conflict",
        message:
          "This business already has a subscription in progress or active.",
        nextStep: "Reload this page to see its current status.",
      };
    case 422:
      return {
        kind: "invalid",
        message: "This plan is not sold in XCD yet.",
        nextStep: "Tell Barrels which plan you want.",
      };
    case 503:
      return {
        kind: "unavailable",
        message: "Billing is not switched on yet.",
        nextStep: "Try again later. Barrels is still setting up payments.",
      };
    default:
      return {
        kind: "unavailable",
        message: "The plan is not available right now.",
        nextStep: "Try again in a moment.",
      };
  }
}

/**
 * Whether a failure should go to Sentry. Expected refusals (403, 404, 409, 422,
 * 503) are shown to the person and not reported. Server faults, unknown statuses,
 * and every 401 are reported: a 401 here means the sign-in is refused, which is a fault.
 */
export function billingFailureNeedsReport(error: unknown): boolean {
  if (!ResponseError.is(error)) {
    return true;
  }
  if (error.status === 401) {
    return true;
  }
  // 503 is "billing is not switched on" (an expected refusal), not a fault.
  if (error.status === 503) {
    return false;
  }
  if (error.status >= 500) {
    return true;
  }
  return ![403, 404, 409, 422].includes(error.status);
}
