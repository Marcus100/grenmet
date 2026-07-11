import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SectionHero } from "@/components/section-hero";

export const metadata: Metadata = {
  title: "Our Airports",
  description:
    "The Grenada Airports Authority manages Maurice Bishop International Airport and Lauriston Airport, and preserves the story of historic Pearls Airport.",
};

const AIRPORTS_LIST = [
  {
    href: "/airports/mbia",
    code: "GND · TGPY",
    name: "Maurice Bishop International Airport",
    blurb:
      "Grenada's international gateway at Point Salines, connecting the island with North America, the UK and the Caribbean since 1984.",
    image: "/images/hero-mbia-aerial.jpg",
    alt: "Aerial view of Maurice Bishop International Airport",
  },
  {
    href: "/airports/lauriston",
    code: "CRU · TGPZ",
    name: "Lauriston Airport, Carriacou",
    blurb:
      "The regional hub near Hillsborough linking Carriacou and Petite Martinique with Grenada — now being upgraded for night operations.",
    image: "/images/lauriston.jpg",
    alt: "Lauriston Airport runway beside the sea on Carriacou",
  },
  {
    href: "/airports/pearls",
    code: "Historic",
    name: "Pearls Airport",
    blurb:
      "Grenada's first airport near Grenville — closed in 1984, alive today as a heritage site and cultural venue.",
    image: "/images/pearls.jpg",
    alt: "The historic Pearls Airport site",
  },
] as const;

export default function AirportsPage() {
  return (
    <>
      <SectionHero
        dek="Two working airports and one historic site tell the story of Grenada's aviation — managed and developed by the Grenada Airports Authority."
        eyebrow="Grenada Airports Authority"
        title="Our airports"
      />
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-14 lg:px-8">
        {AIRPORTS_LIST.map((airport, i) => (
          <Link
            className={`group grid items-center gap-8 overflow-hidden rounded-3xl border border-gaa-rule bg-white transition-shadow hover:shadow-xl md:grid-cols-2 ${
              i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
            }`}
            href={airport.href}
            key={airport.href}
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <Image
                alt={airport.alt}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                src={airport.image}
              />
            </div>
            <div className="p-8 lg:p-12">
              <p className="font-semibold text-gaa-sea text-xs uppercase tracking-[0.2em]">
                {airport.code}
              </p>
              <h2 className="mt-3 font-bold font-display text-2xl text-gaa-navy sm:text-3xl">
                {airport.name}
              </h2>
              <p className="mt-4 text-gaa-muted leading-relaxed">
                {airport.blurb}
              </p>
              <span className="mt-6 inline-block font-medium text-gaa-sea text-sm group-hover:text-gaa-navy">
                Explore →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
