import { ManageBooking } from "@barrelsgd/bookings-web/components/manage-booking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBooking } from "@/lib/booking-api";
import { CONTACT_LABEL } from "@/lib/booking-errors";
import { isBusinessSlug } from "@/lib/slug";
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

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  if (!isBusinessSlug(slug)) {
    notFound();
  }
  const booking = await getBooking(token);
  if (!booking) {
    notFound();
  }
  return (
    <div className="booking space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Your booking</h1>
        <p className="text-muted-foreground">
          See your appointment, add it to your calendar, change the time or
          cancel.
        </p>
      </header>
      <ManageBooking
        actions={{
          cancel: cancelMyBooking,
          loadSlots: loadRescheduleSlots.bind(null, slug),
          reschedule: rescheduleMyBooking,
        }}
        booking={booking}
        calendarHref={`/${slug}/booking/${token}/ics`}
        contact={{ href: `/${slug}`, label: CONTACT_LABEL }}
        token={token}
      />
    </div>
  );
}
