import { ContactStrip } from "@barrelsgd/bookings-web/components/business-contact";
import { timeZonePlace } from "@barrelsgd/bookings-web/lib/booking-format";
import { FunnelEvent } from "@barrelsgd/ui/components/funnel-event";
import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingLink } from "@/components/booking-link";
import { StorefrontLogo } from "@/components/storefront-logo";
import { TrackedBookingFlow } from "@/components/tracked-booking-flow";
import { env } from "@/env";
import { getStorefront } from "@/lib/booking-api";
import { signInPath, signUpHref } from "@/lib/sign-in-links";
import { loadVisitor } from "@/lib/signed-in-visitor";
import { isBusinessSlug } from "@/lib/slug";
import { brandStyle, safeLogoUrl } from "@/lib/storefront-brand";
import { storefrontJsonLd } from "@/lib/storefront-jsonld";
import {
  confirmEmailCode,
  loadSlots,
  requestEmailCode,
  submitBooking,
} from "./actions";

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
  const title = `Book at ${storefront.display_name}`;
  const description = `Book an appointment online with ${storefront.display_name}. Choose a service and a time.`;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title, description, url: `/${slug}`, type: "website" },
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
  // Older cached payloads may lack these fields: both fall back to the shared
  // tokens and no logo. The accent is checked for contrast before it is used.
  const logo = safeLogoUrl(storefront.logo_url);
  // A signed-in person gets their own details prefilled and shortcuts from
  // their own earlier bookings here; a guest gets a blank form, the invitation
  // to create an account or sign in, and a quiet sign-in link.
  const visitor = await loadVisitor(slug);
  const accountInvite = visitor
    ? undefined
    : {
        href: signUpHref(env.AUTH_APP_URL, env.NEXT_PUBLIC_SITE_URL, slug),
      };

  return (
    <div
      className="booking space-y-10"
      style={brandStyle(storefront.brand_color)}
    >
      <FunnelEvent
        app="bookings"
        event="page_view"
        properties={{ organisation: slug, page: "business" }}
      />
      <JsonLd
        data={storefrontJsonLd(
          env.NEXT_PUBLIC_SITE_URL ?? "https://bookings.barrels.gd",
          storefront
        )}
      />
      <header className="space-y-2">
        {logo && <StorefrontLogo name={storefront.display_name} src={logo} />}
        <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] leading-[1.1] font-bold tracking-tight">
          {storefront.display_name}
        </h1>
        <p className="text-muted-foreground">
          Book an appointment online. Times are in{" "}
          {timeZonePlace(storefront.timezone)} time.
        </p>
        {accountInvite && (
          <p className="text-muted-foreground">
            Have a Barrels account?{" "}
            <a
              className="brand-link inline-flex min-h-11 items-center underline underline-offset-4"
              href={signInPath(slug)}
            >
              Sign in
            </a>{" "}
            to have your details filled in. You do not need one to book.
          </p>
        )}
        <ContactStrip contact={storefront.contact} />
        {services.length > 0 && (
          <p>
            <a className="btn btn-solid" href="#book-online">
              Book now
            </a>
          </p>
        )}
      </header>

      {services.length === 0 && (
        <p className="text-muted-foreground">
          Online booking is not open for this business yet.
        </p>
      )}

      {providers.length > 0 && (
        <section aria-labelledby="providers-title" className="space-y-3">
          <h2 className="text-lg font-semibold" id="providers-title">
            Who you can book with
          </h2>
          <ul className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <li
                className="border-border rounded-full border px-3 py-1 text-sm"
                key={provider.id}
              >
                {provider.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {services.length > 0 && (
        <section
          aria-labelledby="book-title"
          className="scroll-mt-6 space-y-3"
          id="book-online"
          tabIndex={-1}
        >
          <h2 className="text-lg font-semibold" id="book-title">
            Book online
          </h2>
          <TrackedBookingFlow
            accountInvite={accountInvite}
            actions={{
              confirmEmailCode: confirmEmailCode.bind(null, slug),
              loadSlots: loadSlots.bind(null, slug),
              requestEmailCode: requestEmailCode.bind(null, slug),
              submitBooking: submitBooking.bind(null, slug),
            }}
            bookAgain={visitor?.bookAgain}
            ManageLink={BookingLink}
            managePath={`/${slug}/booking`}
            signedIn={visitor?.signedIn}
            slug={slug}
            storefront={storefront}
            studioName={storefront.display_name}
            turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </section>
      )}
    </div>
  );
}
