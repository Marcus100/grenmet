import { BOOKING_URL } from "@/data/site";
import { env } from "@/env";

/** The on-site booking route (`app/book`). */
export const ON_SITE_BOOKING_HREF = "/book";

/**
 * Where a Book call-to-action goes. Client components only ever receive a
 * `CtaLink` as a prop and import this type; they never call the functions
 * below, because the switch is a server-only variable.
 */
export interface CtaLink {
  href: string;
  rel?: "noopener";
  /** Acuity opens in a new tab; the on-site flow stays in this one. */
  target?: "_blank";
}

/** The link for one switch state. Pure, so both states are testable. */
export function bookingLink(online: boolean): CtaLink {
  return online
    ? { href: ON_SITE_BOOKING_HREF }
    : { href: BOOKING_URL, target: "_blank", rel: "noopener" };
}

/**
 * The link for the switch as the server reads it. Call it in a Server
 * Component (or layout) and pass the result down to client components.
 */
export function siteBookingLink(): CtaLink {
  return bookingLink(env.BABYDOLL_ONLINE_BOOKING === "on");
}
