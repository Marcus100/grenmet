"use server";

// Starts the Bookings plan's hosted Checkout (ADR-0065). The browser supplies only
// the organisation slug: the plan key is the one this app sells, the organisation
// id comes from the person's own list, and FastAPI re-checks role and state on the
// call. A successful call redirects to Stripe's Checkout URL, after the URL is
// checked to be Stripe over HTTPS.

import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  billingFailure,
  billingFailureNeedsReport,
  PLAN_ADMIN_REQUIRED,
} from "@/lib/billing-errors";
import { BOOKINGS_PLAN_KEY, isStripeCheckoutUrl } from "@/lib/billing-plan";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import type { ActionState } from "@/lib/studio-action-state";
import {
  findOrganisation,
  startAppSubscriptionCheckout,
} from "@/lib/studio-api";
import type { StudioFailure } from "@/lib/studio-errors";
import { canManageBookings } from "@/lib/studio-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;

function fail(failure: StudioFailure): ActionState {
  return { status: "error", ...failure };
}

export async function startSubscriptionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const returnTo = `/studio/${orgSlug}/plan`;
  if (!SLUG.test(orgSlug)) {
    return fail({
      kind: "not_found",
      message: "We could not find that business.",
      nextStep: "Go back to your businesses and choose again.",
    });
  }
  const session = await getSession();
  if (!session) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }

  let url: string;
  try {
    const org = await findOrganisation(session.accessToken, orgSlug);
    if (!org) {
      return fail({
        kind: "not_found",
        message: "We could not find that business.",
        nextStep: "Go back to your businesses and choose again.",
      });
    }
    if (!canManageBookings(org.role)) {
      return fail(PLAN_ADMIN_REQUIRED);
    }
    const checkout = await startAppSubscriptionCheckout(
      session.accessToken,
      org.id,
      BOOKINGS_PLAN_KEY
    );
    url = checkout.url;
  } catch (error) {
    const failure = billingFailure(error);
    if (billingFailureNeedsReport(error)) {
      reportError(error, "studio");
    }
    return fail(failure);
  }

  if (!isStripeCheckoutUrl(url)) {
    reportError(new Error("Checkout URL is not a Stripe checkout"), "studio");
    return fail({
      kind: "unavailable",
      message: "Billing did not return a checkout page.",
      nextStep: "Try again in a moment. If it keeps happening, tell Barrels.",
    });
  }
  // Outside the try: redirect() throws to Next to perform the navigation. The URL
  // was just checked to be Stripe's checkout over HTTPS, so the cast only tells the
  // typed-routes check that an external address is intended here.
  redirect(url as Route);
}
