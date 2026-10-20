import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PageHead } from "@/components/sections";
import { BOOKING_URL, BUSINESS } from "@/data/site";
import { env } from "@/env";
import { getStorefront } from "@/lib/booking-api";

// Read the switch and the live service list on every request, never at build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book online",
  description: `Book lashes, brows, facials and waxing at ${BUSINESS.name} in St. George's, Grenada.`,
  alternates: { canonical: "/book" },
};

export default async function BookPage() {
  // While the switch is off (or the studio's page is disabled) booking stays
  // on the Acuity page and this route is only a redirect.
  if (env.BABYDOLL_ONLINE_BOOKING !== "on") {
    redirect(BOOKING_URL);
  }
  const storefront = await getStorefront();
  if (!storefront) {
    redirect(BOOKING_URL);
  }
  return (
    <>
      <PageHead
        accent="appointment"
        eyebrow="Book online"
        lede="Choose a service and a time. Your request goes straight to the studio, which confirms it by email."
        title="Book your"
      />
      <section className="flush-top block">
        <div className="wrap book-wrap">
          <BookingFlow
            storefront={storefront}
            turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>
      </section>
    </>
  );
}
