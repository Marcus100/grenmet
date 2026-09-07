import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Sea conditions",
  description:
    "Observed sea state around Grenada, Carriacou and Petite Martinique.",
};

export default function SeaConditionsPage() {
  return (
    <>
      <PageHeader
        description="Observed sea state around the tri-island state."
        title="Sea conditions"
      />
      <PlaceholderNotice product="Observed sea state" />
      <PageSection heading="Right now">
        <StatTiles
          stats={[
            { label: "Significant wave height", value: "1.7 m" },
            { label: "Dominant period", value: "7 s" },
            { label: "Sea surface temp", value: "28.4 °C" },
            { label: "Swell direction", value: "NE" },
          ]}
        />
      </PageSection>
      <PageSection heading="Sea state scale">
        <InfoTable
          headers={[
            "Description",
            "Wave height",
            "What it means for small craft",
          ]}
          rows={[
            ["Smooth", "Under 0.5 m", "Comfortable for all vessels"],
            ["Slight", "0.5–1.25 m", "Routine operating conditions"],
            ["Moderate", "1.25–2.5 m", "Uncomfortable in small open boats"],
            ["Rough", "2.5–4.0 m", "Hazardous for small craft"],
            ["Very rough", "Over 4.0 m", "Small craft should remain in port"],
          ]}
        />
      </PageSection>
    </>
  );
}
