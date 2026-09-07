import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Marine forecast",
  description: "Wind, sea state and swell for Grenada waters.",
};

export default function MarineForecastPage() {
  return (
    <>
      <PageHeader
        description="Wind, sea state and swell for Grenada waters."
        title="Marine forecast"
      />
      <PlaceholderNotice product="The marine forecast" />
      <PageSection heading="Next 24 hours">
        <InfoTable
          headers={["Period", "Wind", "Seas", "Swell", "Weather"]}
          rows={[
            [
              "Today",
              "NE 12–18 kt",
              "1.5–2.0 m",
              "NE 1.5 m",
              "Isolated showers",
            ],
            [
              "Tonight",
              "ENE 10–16 kt",
              "1.2–1.8 m",
              "NE 1.4 m",
              "Scattered showers",
            ],
            [
              "Tomorrow",
              "E 12–18 kt",
              "1.5–2.1 m",
              "E 1.6 m",
              "Sunny intervals",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Outlook">
        <Prose
          paragraphs={[
            "Moderate trade winds continue through the period with no marine advisory anticipated. Conditions are expected to remain within the normal range for small craft operating in sheltered waters.",
            "Mariners crossing to Carriacou and Petite Martinique should expect rougher conditions in open water than along the leeward coast of Grenada.",
          ]}
        />
      </PageSection>
    </>
  );
}
