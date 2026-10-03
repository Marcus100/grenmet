import Link from "next/link";

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
      "Browse archived NHC guidance and bulletins, or open the tropical outlook editor.",
  },
  {
    href: "/wxproducts/bulletins",
    title: "Bulletins",
    description:
      "Prepare marine and other hazard bulletins. Save drafts and review them before publication.",
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
      <header className="space-y-2">
        <h1 className="font-semibold text-heading-lg">Weather products</h1>
        <p className="text-body text-muted-foreground">
          Choose a desk to prepare products or review guidance.
        </p>
      </header>
      <nav aria-label="Weather product desks">
        <ul className="grid gap-4 sm:grid-cols-2">
          {desks.map((desk) => (
            <li key={desk.href}>
              <Link
                className="block h-full space-y-2 rounded-lg border bg-card p-6 text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={desk.href}
              >
                <h2 className="font-semibold text-heading-sm">{desk.title}</h2>
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
        <h2 className="font-semibold text-heading-sm" id="hourly-prototype">
          Hourly register — prototype
        </h2>
        <p className="text-body text-muted-foreground">
          Development example with sample observations. It is not a live
          observation register.
        </p>
        <Link
          className="inline-block rounded-sm text-body underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/wxproducts/hourly"
        >
          View hourly register prototype
        </Link>
      </section>
    </div>
  );
}
