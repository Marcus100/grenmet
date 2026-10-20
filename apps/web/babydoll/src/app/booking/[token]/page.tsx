import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/booking/manage-booking";
import { PageHead } from "@/components/sections";
import { getBooking } from "@/lib/booking-api";

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
          <ManageBooking booking={booking} token={token} />
        </div>
      </section>
    </>
  );
}
