import { BOOKING_URL, ONLINE_BOOKING_URL } from "@/data/site";

/**
 * Where a Book call-to-action goes. Booking never happens on this site: it is
 * static (owner, 13 Nov 2026). Every Book link opens the studio's booking
 * page elsewhere, in a new tab.
 */
export interface CtaLink {
  href: string;
  rel: "noopener";
  target: "_blank";
}

/**
 * The link for a given online booking address. With none it is the Acuity
 * page; with one (the studio's page on the Barrels bookings site) it is that
 * page. Pure, so both states are testable.
 */
export function bookingLink(online: string | null): CtaLink {
  return { href: online ?? BOOKING_URL, target: "_blank", rel: "noopener" };
}

/** The link every Book call-to-action on the site uses. */
export function siteBookingLink(): CtaLink {
  return bookingLink(ONLINE_BOOKING_URL);
}
