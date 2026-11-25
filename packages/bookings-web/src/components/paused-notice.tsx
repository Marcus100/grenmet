"use client";

import type { BookingBusinessContact } from "@barrelsgd/api-client";
import { useEffect, useRef } from "react";
import { contactLinks } from "../lib/business-contact";
import { ContactLinks } from "./business-contact";

/**
 * Shown instead of the booking flow while a business is not taking online
 * bookings. Calm and short: it says what is happening and how to reach them.
 * Existing bookings are not affected, and the page that manages one still works.
 */
export function PausedNotice({
  businessName,
  contact,
  Heading = "h2",
  swapped = false,
}: {
  businessName: string;
  contact: BookingBusinessContact | null | undefined;
  /** h2 on a page of its own, h3 when it sits under another h2. */
  Heading?: "h2" | "h3";
  /**
   * True when it replaces a booking form the visitor was filling in: it is
   * announced, takes focus, and says that nothing was booked or saved.
   */
  swapped?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (swapped) {
      headingRef.current?.focus();
    }
  }, [swapped]);
  const who = businessName.trim() || "This business";
  const hasLinks = contactLinks(contact).length > 0;
  return (
    <section
      aria-labelledby="paused-title"
      className="notice paused-notice"
      role={swapped ? "status" : undefined}
    >
      <Heading
        id="paused-title"
        ref={headingRef}
        tabIndex={swapped ? -1 : undefined}
      >
        {who} is not taking online bookings right now
      </Heading>
      {swapped ? (
        <p>Your booking was not made and your details were not saved.</p>
      ) : null}
      {hasLinks ? (
        <>
          <p>You can still reach them directly:</p>
          <ContactLinks contact={contact} />
        </>
      ) : (
        <p>Please check back later.</p>
      )}
      <p className="muted">
        Bookings you already made are not affected. Use the link in your booking
        email to see or change one.
      </p>
    </section>
  );
}
