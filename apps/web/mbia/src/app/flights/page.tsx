import type { Metadata } from "next";
import Link from "next/link";
import { FlightBoard } from "@/components/flight-board";
import { SectionHero } from "@/components/section-hero";
import { isAirportCode, isBoard, SAMPLE_FLIGHTS } from "@/lib/flights";

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

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; airport?: string }>;
}) {
  const params = await searchParams;
  const board = isBoard(params.board) ? params.board : "arrivals";
  const airport = isAirportCode(params.airport) ? params.airport : "GND";

  return (
    <>
      <SectionHero
        dek="Live arrivals and departures for Maurice Bishop International Airport (GND) and Lauriston Airport, Carriacou (CRU)."
        eyebrow="Flight Information"
        title="Arrivals & departures"
      />
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <FlightBoard
          flights={SAMPLE_FLIGHTS}
          initialAirport={airport}
          initialBoard={board}
        />
        <nav
          aria-label="Related travel information"
          className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {HELP_LINKS.map((link) => (
            <Link
              className="rounded-xl border border-gaa-rule px-4 py-3 text-center font-medium text-gaa-navy text-sm transition-colors hover:border-gaa-sea/40 hover:bg-gaa-mist"
              href={link.href}
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
