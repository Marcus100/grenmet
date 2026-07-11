import type { Metadata } from "next";
import { AirportPage } from "@/components/airport-page";

export const metadata: Metadata = {
  title: "Maurice Bishop International Airport (GND)",
  description:
    "Grenada's international gateway at Point Salines — flight information, services and everything you need at MBIA.",
};

export default function MbiaPage() {
  return (
    <AirportPage
      eyebrow="Our Airports"
      facts={[
        { label: "IATA / ICAO", value: "GND / TGPY" },
        { label: "Location", value: "Point Salines, St. George's" },
        { label: "Opened", value: "1984" },
        { label: "Role", value: "International gateway" },
      ]}
      image="/images/hero-mbia-aerial.jpg"
      imageAlt="Aerial view of Maurice Bishop International Airport between the hills and the Caribbean Sea"
      links={[
        { label: "Arrivals & departures", href: "/flights" },
        { label: "Check-in procedures", href: "/travel/check-in-procedures" },
        { label: "Parking at MBIA", href: "/travel/parking-at-mbia" },
        { label: "Lounges, dining & shopping", href: "/at-the-airport" },
        { label: "MBIA history", href: "/corporate/mbia-history" },
      ]}
      name="Maurice Bishop International Airport"
      tagline="Gateway to the Spice of the Caribbean — connecting Grenada with North America, the United Kingdom and the region."
    >
      <p>
        Maurice Bishop International Airport (MBIA) at Point Salines is
        Grenada&rsquo;s primary gateway to the world. Completed in 1984, its
        opening marked a pivotal moment in Grenada&rsquo;s aviation history, and
        today the airport is the cornerstone of the island&rsquo;s connectivity,
        tourism and economic growth.
      </p>
      <p>
        The Grenada Airports Authority is headquartered at MBIA and directs all
        administrative and maintenance support for the nation&rsquo;s airports
        from here. The airport handles direct services from North America, the
        United Kingdom and across the Caribbean, alongside private aviation
        through the on-site jet centre.
      </p>
      <h2>At the airport</h2>
      <p>
        Passengers can make use of the Executive Lounge on the upper mezzanine
        floor (open daily from 6:30 AM to 10:30 PM), duty-free shops in the
        departure lounge and public concourse, dining options, and Fast Track
        meet-and-greet services. Public parking is located northeast of the
        terminal with easy access to check-in.
      </p>
      <h2>A 30-year vision</h2>
      <p>
        MBIA is in the midst of a significant transformation under the
        GAA&rsquo;s 30-year master plan — modernising infrastructure, operations
        and services to make it one of the most advanced airports in the
        Caribbean. Follow progress in our{" "}
        <a href="/development">development section</a>.
      </p>
    </AirportPage>
  );
}
