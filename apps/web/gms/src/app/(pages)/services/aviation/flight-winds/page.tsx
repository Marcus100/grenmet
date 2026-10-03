import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Flight winds",
  description:
    "Wind and temperature at flight levels across the Eastern Caribbean.",
};

export default function FlightWindsPage() {
  return (
    <>
      <PageHeader
        description="Wind and temperature at flight levels."
        title="Flight winds"
      />
      <PlaceholderNotice product="The flight level data on this page" />
      <PageSection heading="Forecast winds — Grenada area">
        <InfoTable
          headers={["Flight level", "Approx. altitude", "Wind", "Temperature"]}
          rows={[
            ["FL050", "5 000 ft", "070° 18 kt", "+18 °C"],
            ["FL100", "10 000 ft", "080° 20 kt", "+9 °C"],
            ["FL180", "18 000 ft", "090° 16 kt", "−5 °C"],
            ["FL240", "24 000 ft", "100° 14 kt", "−18 °C"],
            ["FL300", "30 000 ft", "120° 18 kt", "−36 °C"],
            ["FL390", "39 000 ft", "150° 24 kt", "−56 °C"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why the wind turns with height">
        <Prose
          paragraphs={[
            "Near the surface the easterly trades dominate. Higher up, the flow shifts as the trade layer gives way to the upper circulation — which is why a route can have a headwind at one level and a tailwind at another.",
            "The depth of the trade layer varies day to day, and its top is often marked by a temperature inversion that also caps shower development.",
          ]}
        />
      </PageSection>
    </>
  );
}
