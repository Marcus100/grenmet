import type { Metadata, Route } from "next";
import Link from "next/link";
import { FlightsPageBoard } from "@/components/flights-page-board";
import { SectionHero } from "@/components/section-hero";

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

export default function FlightsPage() {
  return (
    <>
      <SectionHero
        dek="Sample arrivals and departures for Maurice Bishop International Airport (GND) and Lauriston Airport, Carriacou (CRU)."
        eyebrow="Flight Information"
        title="Arrivals & departures"
      />
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <FlightsPageBoard />
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
