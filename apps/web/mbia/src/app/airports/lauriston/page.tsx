import type { Metadata } from "next";
import { AirportPage } from "@/components/airport-page";

export const metadata: Metadata = {
  title: "Lauriston Airport, Carriacou (CRU)",
  description:
    "Lauriston Airport near Hillsborough is Carriacou's aviation hub, linking the island with Grenada and neighbouring destinations.",
};

export default function LauristonPage() {
  return (
    <AirportPage
      eyebrow="Our Airports"
      facts={[
        { label: "IATA / ICAO", value: "CRU / TGPZ" },
        { label: "Location", value: "Hillsborough, Carriacou" },
        { label: "Runway", value: "Single asphalt strip" },
        { label: "Role", value: "Regional hub" },
      ]}
      image="/images/lauriston.jpg"
      imageAlt="Lauriston Airport runway beside the sea on Carriacou"
      links={[
        {
          label: "Arrivals & departures",
          href: "/flights?airport=CRU",
        },
        { label: "Airlines serving Grenada", href: "/travel/airlines-serving" },
        {
          label: "Lauriston development",
          href: "/development/lauriston-airport-development",
        },
        {
          label: "Lauriston history",
          href: "/corporate/lauriston-airport-history",
        },
      ]}
      name="Lauriston Airport, Carriacou"
      tagline="Your passage to paradise — linking you to Carriacou and beyond."
    >
      <p>
        Lauriston Airport (IATA: CRU) is a key regional airport situated near
        Hillsborough on Carriacou. Operated by the Grenada Airports Authority,
        it is the island&rsquo;s primary aviation hub, facilitating domestic air
        travel between Grenada, Carriacou and surrounding destinations.
      </p>
      <p>
        The airport features a single asphalt runway and mainly accommodates
        small aircraft on short regional hops — the fastest way between the
        sister isles.
      </p>
      <h2>Strategic upgrades under way</h2>
      <p>
        Under the CATCOP project, Lauriston is undergoing major upgrades:
        night-landing capability, a runway extension, a new control tower and
        hurricane-resistant infrastructure — positioning the airport for future
        growth and resilience as a critical gateway supporting Carriacou&rsquo;s
        tourism, commerce and regional connectivity.
      </p>
    </AirportPage>
  );
}
