import { ManageBooking } from "@barrelsgd/bookings-web/components/manage-booking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/sections";
import { BOOKING_CONTACT } from "@/data/site";
import { getBooking } from "@/lib/booking-api";
import {
  cancelMyBooking,
  loadRescheduleSlots,
  rescheduleMyBooking,
} from "./actions";

export const dynamic = "force-dynamic";

// The token is a secret in the address: keep it out of search and referrers.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const booking = await getBooking(token);
  if (!booking) {
    notFound();
  }
  return (
    <>
      <PageHead
        accent="booking"
        eyebrow="Manage"
        lede="See your appointment, add it to your calendar, change the time or cancel."
        title="Your"
      />
      <section className="flush-top block">
        <div className="wrap book-wrap">
          <ManageBooking
            actions={{
              cancel: cancelMyBooking,
              loadSlots: loadRescheduleSlots,
              reschedule: rescheduleMyBooking,
            }}
            booking={booking}
            calendarHref={`/booking/${token}/ics`}
            contact={BOOKING_CONTACT}
            token={token}
          />
        </div>
      </section>
    </>
  );
}
