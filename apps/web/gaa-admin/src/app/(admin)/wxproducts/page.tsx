import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Weather products" };

const desks = [
  {
    href: "/wxproducts/fcsts",
    title: "Forecasts",
    description:
      "Prepare morning, midday and evening forecasts. Review saved revisions, publish issues and download PDFs.",
  },
  {
    href: "/wxproducts/nhc",
    title: "NHC Products",
    description:
      "Browse current NHC guidance and previously collected editions.",
  },
  {
    href: "/wxproducts/alerts",
    title: "Alerts",
    description:
      "Prepare tropical outlooks, marine and other hazard bulletins. Save drafts and review them before publication.",
  },
  {
    href: "/wxproducts/aviation",
    title: "Aviation",
    description:
      "Compose and save TAF, METAR and SPECI working drafts. Operational transmission is not available.",
  },
];

export default function WeatherProductsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6">
      <PageHeader
        description="Choose a desk to prepare products or review guidance."
        title="Weather products"
      />
      <nav aria-label="Weather product desks">
        <ul className="grid gap-4 sm:grid-cols-2">
          {desks.map((desk) => (
            <li key={desk.href}>
              <Link
                className="bg-card text-card-foreground hover:bg-accent focus-visible:ring-ring block h-full space-y-2 rounded-lg border p-6 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                href={desk.href as Route}
              >
                <h2 className="text-heading-sm font-semibold">{desk.title}</h2>
                <p className="text-body text-muted-foreground">
                  {desk.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section
        aria-labelledby="hourly-prototype"
        className="space-y-3 rounded-lg border border-dashed p-6"
      >
        <h2 className="text-heading-sm font-semibold" id="hourly-prototype">
          Hourly register — prototype
        </h2>
        <p className="text-body text-muted-foreground">
          Development example with sample observations. It is not a live
          observation register.
        </p>
        <Link
          className="text-body focus-visible:ring-ring inline-block rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          href="/wxproducts/hourly"
        >
          View hourly register prototype
        </Link>
      </section>
    </div>
  );
}
