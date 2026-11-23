// The Barrels Bookings plan as the studio shows it, and the plain-words view of a
// subscription's status. Pure data and functions: no server or client imports, so
// the page, the action and the tests share one reading of the API's fields.
//
// Owner decisions (22 November 2026): the plan is XCD 30 a month; XCD only, with
// USD as a converted note, never a charge; Stripe test mode only for now. The
// Babydoll free month is a plan trial (`trial_end` on the subscription), set on the
// server; this file only reads it.

import type {
  AppSubscriptionPublic,
  AppSubscriptionStatus,
} from "@barrelsgd/api-client";
import { DEFAULT_TIMEZONE } from "@/lib/studio-view";

/** The plan key the checkout route takes (ADR-0065: Bookings is `bookings-monthly`). */
export const BOOKINGS_PLAN_KEY = "bookings-monthly";
/** The app the plan belongs to; the list also carries other apps' subscriptions. */
export const BOOKINGS_APP_KEY = "bookings";

/** The plan price in XCD minor units (cents): XCD 30.00 a month. */
export const PLAN_PRICE_MINOR = 3000;
/** XCD is pegged to USD at 2.70 per USD; the USD figure is a note, not a charge. */
const XCD_PER_USD = 2.7;

/** "XCD 30 a month". Whole dollars drop the cents. */
export function planPriceLabel(amountMinor: number = PLAN_PRICE_MINOR): string {
  const major = amountMinor / 100;
  const amount = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `XCD ${amount} a month`;
}

/** "about USD 11.11 a month", converted at the fixed peg. Shown for reference only. */
export function planUsdNote(amountMinor: number = PLAN_PRICE_MINOR): string {
  const usd = amountMinor / 100 / XCD_PER_USD;
  return `about USD ${usd.toFixed(2)} a month, for reference. You pay in XCD.`;
}

/** The subscription that matters for this app: the newest one for Bookings. */
export function bookingsSubscription(
  subscriptions: readonly AppSubscriptionPublic[]
): AppSubscriptionPublic | undefined {
  // The API lists newest first; the first Bookings row is the current one.
  return subscriptions.find((item) => item.app_key === BOOKINGS_APP_KEY);
}

/** What the studio can say about the plan, decided from one subscription row. */
export type PlanState =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "trial"; endsOn: string }
  | { kind: "active"; renewsOn: string | null }
  | { kind: "ending"; endsOn: string | null }
  | { kind: "past_due" }
  | { kind: "unpaid" }
  | { kind: "cancelled" };

/** Maps a row to a state. `now` is injected so a trial that has ended reads as active. */
export function planState(
  subscription: AppSubscriptionPublic | undefined,
  now: Date = new Date()
): PlanState {
  if (!subscription) {
    return { kind: "none" };
  }
  const status: AppSubscriptionStatus = subscription.status;
  switch (status) {
    case "incomplete":
      return { kind: "pending" };
    case "past_due":
      return { kind: "past_due" };
    case "unpaid":
      return { kind: "unpaid" };
    case "canceled":
      return { kind: "cancelled" };
    case "active": {
      const periodEnd = subscription.current_period_end;
      if (subscription.cancel_at_period_end) {
        return { kind: "ending", endsOn: periodEnd ?? subscription.trial_end };
      }
      const trialEnd = subscription.trial_end;
      if (trialEnd && new Date(trialEnd).getTime() > now.getTime()) {
        return { kind: "trial", endsOn: trialEnd };
      }
      return { kind: "active", renewsOn: periodEnd };
    }
    default:
      // A status this app does not know yet: say nothing false about the plan.
      return { kind: "none" };
  }
}

/** A day on the business calendar, for example "15 December 2026". */
export function formatPlanDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date(iso));
}

export interface PlanCopy {
  detail: string;
  heading: string;
}

/** The status in plain words. Every state has a heading, so the section is never empty. */
export function planCopy(state: PlanState): PlanCopy {
  switch (state.kind) {
    case "none":
      return {
        heading: "No subscription yet",
        detail: "Start the plan to keep online bookings for your business.",
      };
    case "pending":
      return {
        heading: "Checkout not finished",
        detail:
          "Your checkout is still open. Continue it to start the subscription.",
      };
    case "trial":
      return {
        heading: "Free month",
        detail: `Your free month ends on ${formatPlanDay(state.endsOn)}. After that the plan costs ${planPriceLabel()}.`,
      };
    case "active":
      return {
        heading: "Active",
        detail: state.renewsOn
          ? `Renews on ${formatPlanDay(state.renewsOn)}.`
          : "Your subscription is active.",
      };
    case "ending":
      return {
        heading: "Ending",
        detail: state.endsOn
          ? `Active until ${formatPlanDay(state.endsOn)}. It will not renew after that.`
          : "It will not renew after the current period.",
      };
    case "past_due":
      return {
        heading: "Payment overdue",
        detail:
          "The last payment did not go through. Contact Barrels to sort it out.",
      };
    case "unpaid":
      return {
        heading: "Unpaid",
        detail:
          "Payments have stopped, so the plan is paused. Contact Barrels to restart it.",
      };
    case "cancelled":
      return {
        heading: "Cancelled",
        detail: "This plan is cancelled. You can start it again below.",
      };
    default:
      // Unreachable with the union above; kept so a new state never shows a blank section.
      return {
        heading: "No subscription yet",
        detail: "Start the plan to keep online bookings for your business.",
      };
  }
}

/** Whether the studio offers the checkout button, and with which words. */
export function checkoutAction(
  state: PlanState
): { label: "Start subscription" | "Continue checkout" } | null {
  switch (state.kind) {
    case "none":
    case "cancelled":
      return { label: "Start subscription" };
    case "pending":
      return { label: "Continue checkout" };
    default:
      return null;
  }
}

/**
 * The redirect target must be Stripe's hosted Checkout over HTTPS. The API builds
 * the URL, but the studio does not send a browser anywhere the API did not name.
 */
export function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

/** The query value Stripe's return URLs carry back to the plan page. */
export const CHECKOUT_RETURN_PARAM = "checkout";

export type CheckoutReturn = "success" | "cancelled" | null;

/** Reads `?checkout=` from the plan page. Anything else is no banner. */
export function checkoutReturn(value: string | undefined): CheckoutReturn {
  if (value === "success" || value === "cancelled") {
    return value;
  }
  return null;
}

/**
 * The banner words for a return. Success is not yet a paid plan: the webhook
 * records it, so the status below may still read "Checkout not finished" for a
 * moment. The copy says so.
 */
export function checkoutReturnCopy(
  result: Exclude<CheckoutReturn, null>
): string {
  if (result === "success") {
    return "Thank you. Stripe has your checkout. The plan status below updates once Stripe confirms the payment, usually within a minute.";
  }
  return "Checkout was cancelled. Nothing was charged. You can start the plan again below.";
}
