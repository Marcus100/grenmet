import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Monthly climate summary",
  description:
    "How last month compared with normal across the tri-island state.",
};

export default function MonthlyPage() {
  return (
    <>
      <PageHeader
        description="How last month compared with normal."
        title="Monthly climate summary"
      />
      <PlaceholderNotice product="The monthly summary" />
      <PageSection heading="Last month at a glance">
        <StatTiles
          stats={[
            {
              label: "Rainfall",
              value: "72% of normal",
              detail: "Drier than usual",
            },
            {
              label: "Mean temperature",
              value: "+0.4 °C",
              detail: "Above normal",
            },
            { label: "Rain days", value: "14", detail: "Normal is 18" },
            {
              label: "Highest daily total",
              value: "48 mm",
              detail: "Grand Etang",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Summary">
        <Prose
          paragraphs={[
            "The month was drier than normal across the tri-island state, with the largest deficits on the southern coast of Grenada and on Carriacou. The interior highlands came closest to normal.",
            "Mean temperatures ran slightly above normal, consistent with reduced cloud cover and fewer rain days.",
            "No warning-level rainfall event occurred during the month.",
          ]}
        />
      </PageSection>
    </>
  );
}
