import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import { websiteJsonLd } from "@barrelsgd/ui/lib/seo";
import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/env";

export const metadata: Metadata = {
  title: "Online appointments in Grenada",
  description:
    "Book an appointment online with Grenada businesses. Each business has its own booking page, with its services and times.",
  alternates: { canonical: "/" },
};

/** A business's public booking page, used as the worked example. */
const EXAMPLE_BOOKING_PAGE = "/babydoll-beauty-bar";

// Every link here is a 44 px target (`min-h-11`), phone first.
const LINK =
  "inline-flex min-h-11 items-center font-medium underline underline-offset-4";

export default function HomePage() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 p-6"
      id="main-content"
    >
      <JsonLd
        data={websiteJsonLd({
          name: "Barrels Bookings",
          siteUrl: env.NEXT_PUBLIC_SITE_URL ?? "https://bookings.barrels.gd",
          description: "Online appointments for Grenada businesses.",
        })}
      />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm font-medium">
          Barrels Bookings
        </p>
        <Link className={LINK} href="/studio">
          For businesses
        </Link>
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Online appointments for Grenada businesses
        </h1>
        <p className="text-muted-foreground">
          Each business has its own booking page, with its services, prices and
          open times. Open the booking page the business sent you.
        </p>
        <p className="text-muted-foreground">
          There is no list of businesses here yet, so ask the business for its
          booking link. For example, this is a booking page:{" "}
          <Link className={LINK} href={EXAMPLE_BOOKING_PAGE}>
            see an example booking page
          </Link>
          .
        </p>
      </section>

      <section
        aria-labelledby="businesses-heading"
        className="flex flex-col gap-2"
      >
        <h2 className="text-lg font-semibold" id="businesses-heading">
          For businesses
        </h2>
        <p className="text-muted-foreground">
          Set up your services, hours and appointments in the studio. Sign in
          with a Barrels account to open it.
        </p>
      </section>

      <p className="text-muted-foreground text-sm">
        Questions about Barrels Bookings? Email Barrels Grenada support at{" "}
        <a
          className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4"
          href={BARRELS_SUPPORT_HREF}
        >
          {BARRELS_SUPPORT_EMAIL}
        </a>
        .
      </p>
    </main>
  );
}
