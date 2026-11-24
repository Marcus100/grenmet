import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import { websiteJsonLd } from "@barrelsgd/ui/lib/seo";
import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessListing } from "@/components/home/business-listing";
import { BottomNav, HeaderNav } from "@/components/home/home-nav";
import { env } from "@/env";
import { listingQuery } from "@/lib/business-listing-query";
import { getPublicBusinesses } from "@/lib/public-businesses";

export const metadata: Metadata = {
  title: "Book any appointment in Grenada",
  description:
    "Book an appointment online with doctors, barbers, salons, mechanics, tutors and other Grenada businesses. Each business has its own booking page, with its services and times.",
  alternates: { canonical: "/" },
};

export default async function HomePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = listingQuery(await searchParams);
  const listing = await getPublicBusinesses(query);
  return (
    <div className="bg-ground text-foreground min-h-screen">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:gap-8 md:px-6 md:pb-12"
        id="main-content"
      >
        <JsonLd
          data={websiteJsonLd({
            name: "Barrels Bookings",
            siteUrl: env.NEXT_PUBLIC_SITE_URL ?? "https://bookings.barrels.gd",
            description: "Online appointments for Grenada businesses.",
          })}
        />
        <header className="flex min-h-11 items-center justify-between gap-3">
          <p className="text-primary text-base font-bold tracking-tight">
            Barrels Bookings
          </p>
          <HeaderNav />
        </header>

        <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
          Book any appointment in Grenada
        </h1>

        <p className="text-foreground -mt-2">
          Pick a business below, or open the booking page the business sent you.
        </p>

        <BusinessListing listing={listing} query={query} />

        <section
          aria-labelledby="for-businesses-heading"
          className="bg-primary text-primary-foreground flex flex-col gap-3 rounded-3xl p-6"
        >
          <h2 className="text-xl font-bold" id="for-businesses-heading">
            Run a business?
          </h2>
          <p>
            Salon, clinic, garage, gym, office or tutor: take bookings online
            with your own page, services and hours. A business chooses whether
            it is listed here.
          </p>
          <Link
            className="bg-background text-primary inline-flex min-h-11 items-center self-start rounded-full px-6 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            href="/studio"
          >
            Open the studio
          </Link>
        </section>

        <p className="text-sm">
          Questions about Barrels Bookings? Email Barrels Grenada support at{" "}
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            href={BARRELS_SUPPORT_HREF}
          >
            {BARRELS_SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
