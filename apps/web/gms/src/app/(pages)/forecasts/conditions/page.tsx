import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Current conditions",
  description:
    "The latest surface observations from Maurice Bishop International Airport and the GMS station network.",
};

export default function ConditionsPage() {
  return (
    <>
      <PageHeader
        description="The latest observations from the GMS station network."
        title="Current conditions"
      />
      <PlaceholderNotice product="Live surface observations" />
      <PageSection heading="Point Salines — Maurice Bishop International Airport">
        <StatTiles
          stats={[
            {
              label: "Temperature",
              value: "28 °C",
              detail: "Feels like 32 °C",
            },
            { label: "Wind", value: "NE 14 kt", detail: "Gusting 20 kt" },
            { label: "Humidity", value: "78%" },
            { label: "Pressure", value: "1013.2 hPa", detail: "Steady" },
          ]}
        />
      </PageSection>
      <PageSection heading="Across the network">
        <InfoTable
          caption="Most recent hourly observation from each reporting station"
          headers={["Station", "Temp", "Wind", "Rain (24 h)"]}
          rows={[
            ["Point Salines (MBIA)", "28 °C", "NE 14 kt", "2.4 mm"],
            ["St. George's", "29 °C", "NE 10 kt", "4.1 mm"],
            ["Pearls, St. Andrew", "28 °C", "ENE 12 kt", "8.6 mm"],
            ["Grand Etang", "23 °C", "E 8 kt", "18.2 mm"],
            ["Lauriston, Carriacou", "29 °C", "NE 16 kt", "0.8 mm"],
          ]}
        />
      </PageSection>
    </>
  );
}
