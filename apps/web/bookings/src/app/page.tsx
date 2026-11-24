import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import { websiteJsonLd } from "@barrelsgd/ui/lib/seo";
import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessListing } from "@/components/home/business-listing";
import { BottomNav, SideRail } from "@/components/home/home-nav";
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
    <div className="bg-ground text-foreground min-h-screen overflow-x-clip md:pl-24">
      <SideRail />
      <main
        className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:gap-8 md:px-8 md:pt-4 md:pb-12"
        id="main-content"
      >
        <JsonLd
          data={websiteJsonLd({
            name: "Barrels Bookings",
            siteUrl: env.NEXT_PUBLIC_SITE_URL ?? "https://bookings.barrels.gd",
            description: "Online appointments for Grenada businesses.",
          })}
        />

        <BusinessListing
          intro={
            <div className="flex flex-col gap-3">
              <section className="enter bg-primary text-primary-foreground relative flex min-h-[300px] flex-col justify-end gap-2.5 overflow-hidden rounded-[36px] px-6 py-7 md:min-h-[400px] md:rounded-[44px] md:px-9 md:py-10">
                <span
                  aria-hidden="true"
                  className="drift-a pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-3xl md:size-96"
                />
                <span
                  aria-hidden="true"
                  className="drift-b pointer-events-none absolute top-1/3 -left-24 size-64 rounded-full bg-white/10 blur-3xl md:size-80"
                />
                <h1 className="relative text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] md:text-[64px] md:leading-none md:tracking-[-0.035em]">
                  Book any appointment in Grenada
                </h1>
                <p className="relative text-base md:text-[17px]">
                  Doctor, barber, mechanic, tutor. Pick a time and it is yours.
                </p>
                <a
                  className="press bg-background text-primary focus-visible:ring-offset-primary mt-1.5 inline-flex h-12 items-center self-start rounded-full px-6 text-base font-bold focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
                  href="#businesses"
                >
                  Find a business
                </a>
              </section>
              <p className="enter-fade text-foreground px-1">
                Pick a business below, or open the booking page the business
                sent you.
              </p>
            </div>
          }
          listing={listing}
          query={query}
        />

        <section
          aria-labelledby="for-businesses-heading"
          className="text-background bg-foreground flex flex-col gap-2.5 rounded-[36px] p-6"
        >
          <h2
            className="text-2xl font-extrabold tracking-tight"
            id="for-businesses-heading"
          >
            Run a business?
          </h2>
          <p>
            Salon, clinic, garage, gym, office or tutor: take bookings online
            with your own page, services and hours. A business chooses whether
            it is listed here.
          </p>
          <Link
            className="press bg-background text-foreground focus-visible:ring-offset-foreground inline-flex h-12 items-center self-start rounded-full px-6 text-[15px] font-bold focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
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
