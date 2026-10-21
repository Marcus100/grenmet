import { BookingFlow } from "@barrelsgd/bookings-web/components/booking-flow";
import {
  formatDuration,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingLink } from "@/components/booking-link";
import { env } from "@/env";
import { getStorefront } from "@/lib/booking-api";
import { CONTACT_LABEL } from "@/lib/booking-errors";
import { isBusinessSlug } from "@/lib/slug";
import { loadSlots, submitBooking } from "./actions";

// Read the live service list on every request, never at build.
export const dynamic = "force-dynamic";

interface BusinessPageProps {
  params: Promise<{ slug: string }>;
}

// Metadata and the page share one API call per request.
const loadStorefront = cache(async (slug: string) =>
  isBusinessSlug(slug) ? await getStorefront(slug) : null
);

export async function generateMetadata({
  params,
}: BusinessPageProps): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await loadStorefront(slug);
  if (!storefront) {
    return { title: "Booking page not found", robots: { index: false } };
  }
  return {
    title: `Book at ${storefront.display_name}`,
    description: `Book an appointment online with ${storefront.display_name}. Choose a service and a time.`,
    alternates: { canonical: `/${slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function BusinessBookingPage({
  params,
}: BusinessPageProps) {
  const { slug } = await params;
  const storefront = await loadStorefront(slug);
  if (!storefront) {
    notFound();
  }
  const { providers, services } = storefront;

  return (
    <div className="booking space-y-10">
      <header className="space-y-2">
        <h1 className="font-bold text-[clamp(1.75rem,5vw,2.5rem)] leading-[1.1] tracking-tight">
          {storefront.display_name}
        </h1>
        <p className="text-muted-foreground">
          Book an appointment online. Times are in{" "}
          {storefront.timezone.replace("_", " ")} time.
        </p>
      </header>

      <section aria-labelledby="services-title" className="space-y-3">
        <h2 className="font-semibold text-lg" id="services-title">
          Services
        </h2>
        {services.length === 0 ? (
          <p className="text-muted-foreground">
            Online booking is not open for this business yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {services.map((service) => (
              <li
                className="flex items-start justify-between gap-4 px-4 py-3"
                key={service.id}
              >
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDuration(service.duration_min)}
                    {service.deposit_minor > 0
                      ? ` · ${formatMoney(service.deposit_minor)} deposit`
                      : ""}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatMoney(service.price_minor)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {providers.length > 0 && (
        <section aria-labelledby="providers-title" className="space-y-3">
          <h2 className="font-semibold text-lg" id="providers-title">
            Who you can book with
          </h2>
          <ul className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <li
                className="rounded-full border border-border px-3 py-1 text-sm"
                key={provider.id}
              >
                {provider.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {services.length > 0 && (
        <section aria-labelledby="book-title" className="space-y-3">
          <h2 className="font-semibold text-lg" id="book-title">
            Book online
          </h2>
          <BookingFlow
            actions={{
              loadSlots: loadSlots.bind(null, slug),
              submitBooking: submitBooking.bind(null, slug),
            }}
            contact={{ href: `/${slug}`, label: CONTACT_LABEL }}
            ManageLink={BookingLink}
            managePath={`/${slug}/booking`}
            storefront={storefront}
            studioName={storefront.display_name}
            turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </section>
      )}
    </div>
  );
}
