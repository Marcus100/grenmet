"use client";

import type { BookingLinkProps } from "@barrelsgd/bookings-web/components/booking-flow";
import Link from "next/link";

/**
 * The booking package's links use Next's client-side routing, as the rest of
 * the site does. The package builds its hrefs at runtime, which typed routes
 * cannot check, so they go in as a pathname object (the form Link accepts).
 */
export function BookingLink({ children, className, href }: BookingLinkProps) {
  return (
    <Link className={className} href={{ pathname: href }}>
      {children}
    </Link>
  );
}
