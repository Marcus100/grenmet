import type { BookingStorefront } from "@barrelsgd/api-client";
import { ContactLinks } from "@barrelsgd/bookings-web/components/business-contact";
import { contactEnding } from "@barrelsgd/bookings-web/lib/business-contact";
import Link from "next/link";

/**
 * What a customer sees when a manage link points at no booking: a mistyped or
 * cut-off link, or a booking old enough that its link has been cleared. Names
 * the business when the address says which one it is, and points to the two
 * things a customer can do next. Promises nothing the system does not do.
 */
export function MissingBooking({
  business,
  slug,
}: Readonly<{
  business: Pick<BookingStorefront, "display_name" | "contact"> | null;
  slug: string;
}>) {
  const name = business?.display_name;
  return (
    <div className="booking space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">We could not find this booking</h1>
        <p className="text-muted-foreground">
          {name
            ? `This link does not match a booking with ${name}.`
            : "This link does not match a booking."}
        </p>
        <p className="text-muted-foreground">
          This link may have expired. Check the link in your email, or contact
          the business directly.
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What you can do</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Open the link again from your confirmation email. It may have been
            cut short when it was copied.
          </li>
          <li>
            Booking links stop working a few months after the appointment. If
            yours is old, make a new booking.
          </li>
          <li>
            To change or cancel a booking, contact {name ?? "the business"}
            {contactEnding(business?.contact)}
            <ContactLinks contact={business?.contact} />
          </li>
        </ul>
      </section>
      <Link className="btn btn-solid" href={`/${slug}`}>
        {name ? `Book with ${name}` : "Make a new booking"}
      </Link>
    </div>
  );
}
