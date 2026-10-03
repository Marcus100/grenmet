import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Coral heat stress",
  description:
    "Bleaching risk for the coral reefs of Grenada, Carriacou and Petite Martinique.",
};

export default function CoralPage() {
  return (
    <>
      <PageHeader
        description="Bleaching risk for Grenada's reefs."
        title="Coral heat stress"
      />
      <PlaceholderNotice product="The coral heat-stress level" />
      <PageSection heading="Heat stress levels">
        <InfoTable
          caption="Based on degree heating weeks (DHW): how much, and for how long, the sea has been hotter than the reef can tolerate"
          headers={["Level", "Heat stress", "What it means for coral"]}
          rows={[
            ["No stress", "None", "Normal conditions"],
            ["Watch", "Low", "Sea warming towards the stress threshold"],
            [
              "Warning",
              "Building",
              "Stress is accumulating; bleaching possible",
            ],
            ["Alert level 1", "4 DHW or more", "Significant bleaching likely"],
            [
              "Alert level 2",
              "8 DHW or more",
              "Severe, widespread bleaching and some coral death likely",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="What bleaching is">
        <Prose
          paragraphs={[
            "Corals live with tiny algae in their tissue that give them food and colour. When the water stays too warm for too long, corals expel the algae and turn white. Bleached coral is not dead, but it is starving; if the heat lasts, it can die.",
            "Healthy reefs protect Grenada's coast from waves and support fisheries and tourism, so heat stress on the reefs matters to everyone.",
          ]}
        />
      </PageSection>
    </>
  );
}
