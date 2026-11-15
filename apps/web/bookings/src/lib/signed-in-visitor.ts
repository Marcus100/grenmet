// What a signed-in visitor's own account and earlier bookings let the public
// booking page prefill. Server only: it reads the session and calls the API.
//
// Privacy (ADR-0037): the values go only to the signed-in person's own browser,
// each one from their own session or from the API's answer to their own token.
// Nothing here is logged or sent to Sentry, and a fault never stops a booking.

import "server-only";

import type {
  BookAgainChoice,
  SignedInVisitor,
} from "@barrelsgd/bookings-web/components/booking-flow";
import { getMyChoices } from "@/lib/booking-api";
import { reportError } from "@/lib/report-error";
import { getSession, type StudioSession } from "@/lib/session";

/** Where the booking page's "Sign out" button posts (ends this app's session only). */
export const SIGN_OUT_ACTION = "/auth/logout";

export interface Visitor {
  bookAgain: BookAgainChoice[];
  signedIn: SignedInVisitor;
}

/**
 * The signed-in person, or null for a guest. A sign-in fault counts as a guest
 * and is reported, because it must not stop anyone booking (the booking action
 * does the same).
 */
async function sessionOrNull(): Promise<StudioSession | null> {
  try {
    return await getSession();
  } catch (error) {
    reportError(error, "bookings-public-session");
    return null;
  }
}

/**
 * The signed-in person's prefill and "Book again" shortcuts for one business, or
 * null for a guest. If the API cannot answer, the name and email from the
 * session still prefill and the shortcuts are left out.
 */
export async function loadVisitor(slug: string): Promise<Visitor | null> {
  const session = await sessionOrNull();
  if (!session) {
    return null;
  }
  let phone = "";
  let bookAgain: BookAgainChoice[] = [];
  try {
    const choices = await getMyChoices(slug, session.accessToken);
    phone = choices?.phone ?? "";
    bookAgain = (choices?.recent ?? []).map((choice) => ({
      providerId: choice.provider_id,
      serviceId: choice.service_id,
    }));
  } catch (error) {
    reportError(error, "bookings-public-choices");
  }
  return {
    bookAgain,
    signedIn: {
      email: session.email,
      name: session.fullName,
      phone,
      signOutAction: SIGN_OUT_ACTION,
    },
  };
}
