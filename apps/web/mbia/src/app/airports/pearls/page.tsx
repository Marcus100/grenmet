import type { Metadata } from "next";
import { AirportPage } from "@/components/airport-page";

export const metadata: Metadata = {
  title: "Pearls Airport (Historic)",
  description:
    "Pearls Airport near Grenville was Grenada's first airport. No longer in operation, it remains a fascinating piece of aviation history.",
};

export default function PearlsPage() {
  return (
    <AirportPage
      eyebrow="Our Airports"
      facts={[
        { label: "Status", value: "Closed 1984" },
        { label: "Location", value: "Near Grenville, St. Andrew's" },
        { label: "Runway", value: "≈5,200 ft (1,600 m)" },
        { label: "Role", value: "Heritage site" },
      ]}
      image="/images/pearls.jpg"
      imageAlt="The historic Pearls Airport site with remnants of old aircraft"
      links={[
        {
          label: "Pearls Airport history",
          href: "/corporate/pearls-airport-history",
        },
        { label: "MBIA — today's gateway", href: "/airports/mbia" },
        { label: "Discover Grenada", href: "/travel/discover-grenada" },
      ]}
      name="Pearls Airport"
      tagline="Grenada's first airport — where the island's aviation story began."
    >
      <p>
        Pearls Airport, near Grenville on Grenada&rsquo;s northeast coast, was
        the island&rsquo;s first airport. First used by Allied forces during
        World War II, it was later converted to civilian use, with its runway
        extended and paved to approximately 5,200 feet (1,600 metres).
      </p>
      <p>
        Operations ceased in 1984 when Maurice Bishop International Airport
        opened at Point Salines. Though no longer in operation, Pearls remains a
        fascinating attraction — remnants of old aircraft and an overgrown
        runway tell stories of the past.
      </p>
      <h2>New life for a historic site</h2>
      <p>
        Today the site hosts motor racing, cultural events and exploration,
        offering visitors a unique glimpse into Grenada&rsquo;s aviation history
        and local culture.
      </p>
    </AirportPage>
  );
}
