import { ContactStrip } from "@barrelsgd/bookings-web/components/business-contact";
import { PausedNotice } from "@barrelsgd/bookings-web/components/paused-notice";
import { timeZonePlace } from "@barrelsgd/bookings-web/lib/booking-format";
import { AccountMenu } from "@barrelsgd/ui/components/account-menu";
import { FunnelEvent } from "@barrelsgd/ui/components/funnel-event";
import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingLink } from "@/components/booking-link";
import { ReportListingLink } from "@/components/report-listing-link";
import { StorefrontLogo } from "@/components/storefront-logo";
import { TrackedBookingFlow } from "@/components/tracked-booking-flow";
import { env } from "@/env";
import { getStorefront } from "@/lib/booking-api";
import { serviceIdFromQuery } from "@/lib/service-link";
import { signInPath, signUpHref } from "@/lib/sign-in-links";
import { loadVisitor } from "@/lib/signed-in-visitor";
import { isBusinessSlug } from "@/lib/slug";
import { brandStyle, safeCoverUrl, safeLogoUrl } from "@/lib/storefront-brand";
import { storefrontJsonLd } from "@/lib/storefront-jsonld";
import { businessTransitionStyle } from "@/lib/view-transition";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Metadata and the page share one API call per request.
const loadStorefront = cache(async (slug: string) =>
  isBusinessSlug(slug) ? await getStorefront(slug) : null
);

export async function generateMetadata({
  params,
}: Pick<BusinessPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await loadStorefront(slug);
  if (!storefront) {
    return { title: "Booking page not found", robots: { index: false } };
  }
  const name = storefront.display_name;
  const title = `Book at ${name}`;
  const description = `Book an appointment online with ${name}. Choose a service and a time.`;
  // The share preview: the cover photo, else the logo, else the app default.
  const cover = safeCoverUrl(storefront.cover_url);
  const image = cover ?? safeLogoUrl(storefront.logo_url);
  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title,
      description,
      url: `/${slug}`,
      type: "website",
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    ...(image
      ? {
          twitter: {
            // A cover photo is wide enough for the large card; a logo is not.
            card: cover ? "summary_large_image" : "summary",
            title,
            description,
            images: [image],
          },
        }
      : {}),
    robots: { index: true, follow: true },
  };
}

export default async function BusinessBookingPage({
  params,
  searchParams,
}: BusinessPageProps) {
  const { slug } = await params;
  // `?service=<id>` preselects a service; anything malformed is ignored, and
  // the flow ignores an id the business does not offer.
  const initialServiceId = serviceIdFromQuery((await searchParams).service);
  const storefront = await loadStorefront(slug);
  if (!storefront) {
    notFound();
  }
  // While the business is paused the API sends no services: say so calmly and
  // show its contact options instead of the form. Older payloads lack the field.
  const accepting = storefront.accepting_bookings !== false;
  const { providers, services } = storefront;
  // Older cached payloads may lack these fields: both fall back to the shared
  // tokens and no logo. The accent is checked for contrast before it is used.
  const logo = safeLogoUrl(storefront.logo_url);
  const transition = businessTransitionStyle(slug);
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
        {visitor ? (
          <div className="flex justify-end">
            <AccountMenu
              accountUrl={env.ACCOUNT_APP_URL}
              signOut={{ href: visitor.signedIn.signOutAction }}
              user={{
                email: visitor.signedIn.email,
                name: visitor.signedIn.name || null,
              }}
            />
          </div>
        ) : null}
        {logo && <StorefrontLogo name={storefront.display_name} src={logo} />}
        <h1
          className={cn(
            transition ? "vt-biz" : undefined,
            "text-[clamp(1.75rem,5vw,2.5rem)] leading-[1.1] font-bold tracking-tight"
          )}
          style={transition}
        >
          {storefront.display_name}
        </h1>
        {accepting && (
          <p className="text-muted-foreground">
            Book an appointment online. Times are in{" "}
            {timeZonePlace(storefront.timezone)} time.
          </p>
        )}
        {accepting && accountInvite && (
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
        {accepting && <ContactStrip contact={storefront.contact} />}
        {accepting && services.length > 0 && (
          <p>
            <a className="btn btn-solid" href="#book-online">
              Book now
            </a>
          </p>
        )}
      </header>

      {!accepting && (
        <PausedNotice
          businessName={storefront.display_name}
          contact={storefront.contact}
        />
      )}

      {accepting && services.length === 0 && (
        <p className="text-muted-foreground">
          Online booking is not open for this business yet.
        </p>
      )}

      {accepting && providers.length > 0 && (
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

      {accepting && services.length > 0 && (
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
            initialServiceId={initialServiceId}
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

      <ReportListingLink slug={slug} />
    </div>
  );
}
