import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Coastal waters forecast",
  description:
    "Conditions within 12 nautical miles of Grenada, Carriacou and Petite Martinique.",
};

export default function CoastalWatersPage() {
  return (
    <>
      <PageHeader
        description="Conditions within 12 nautical miles of the tri-island state."
        title="Coastal waters forecast"
      />
      <PlaceholderNotice product="The coastal waters forecast" />
      <PageSection heading="By zone">
        <InfoTable
          headers={["Zone", "Wind", "Seas", "Notes"]}
          rows={[
            [
              "Leeward Grenada (west coast)",
              "NE 8–14 kt",
              "0.8–1.2 m",
              "Sheltered; smoothest water",
            ],
            [
              "Windward Grenada (east coast)",
              "NE 14–20 kt",
              "1.8–2.4 m",
              "Exposed to open Atlantic swell",
            ],
            [
              "Grenada south coast",
              "NE 12–18 kt",
              "1.2–1.8 m",
              "Choppy near headlands",
            ],
            [
              "Grenada–Carriacou passage",
              "NE 14–20 kt",
              "1.8–2.4 m",
              "Confused sea on the crossing",
            ],
            [
              "Carriacou and Petite Martinique",
              "NE 14–20 kt",
              "1.5–2.1 m",
              "Exposed on eastern shores",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why the coasts differ">
        <Prose
          paragraphs={[
            "Grenada's mountainous spine shelters the western coast from the prevailing north-easterly trades. The difference between the leeward and windward sides on the same day is routinely a metre of sea height.",
            "Conditions in the passage between Grenada and Carriacou are consistently rougher than either island's coastal water, because the flow accelerates through the gap.",
          ]}
        />
      </PageSection>
    </>
  );
}
