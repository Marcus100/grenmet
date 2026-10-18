import type { Metadata, Route } from "next";
import Link from "next/link";
import { FlightsPageBoard } from "@/components/flights-page-board";
import { SectionHero } from "@/components/section-hero";
import { loadFlightData } from "@/lib/live-flights";

export const metadata: Metadata = {
  title: "Flight Information",
  description:
    "Arrivals and departures for Maurice Bishop International Airport (GND) and Lauriston Airport, Carriacou (CRU).",
};

const HELP_LINKS = [
  { label: "Check-in procedures", href: "/travel/check-in-procedures" },
  { label: "Baggage policies", href: "/travel/baggage-policies" },
  { label: "Airlines serving Grenada", href: "/travel/airlines-serving" },
  { label: "Getting to the airport", href: "/travel/ground-transportation" },
];

// Re-rendered at most every 30 minutes; the page stays statically cached.
export const revalidate = 1800;

export default async function FlightsPage() {
  const data = await loadFlightData();
  const isSample = data.source === "sample";
  return (
    <>
      <SectionHero
        dek={
          isSample
            ? "Sample arrivals and departures for Maurice Bishop International Airport (GND) and Lauriston Airport, Carriacou (CRU)."
            : "Recent aircraft movements at Maurice Bishop International Airport (GND), from OpenSky Network research data."
        }
        eyebrow="Flight Information"
        title="Arrivals & departures"
      />
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <FlightsPageBoard data={data} />
        <nav
          aria-label="Related travel information"
          className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {HELP_LINKS.map((link) => (
            <Link
              className="rounded-xl border border-gaa-rule px-4 py-3 text-center font-medium text-gaa-navy text-sm transition-colors hover:border-gaa-sea/40 hover:bg-gaa-mist"
              href={link.href as Route}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
