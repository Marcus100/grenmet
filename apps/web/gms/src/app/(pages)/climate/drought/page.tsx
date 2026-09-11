import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Drought monitoring",
  description:
    "Dry-spell and drought status across Grenada, Carriacou and Petite Martinique.",
};

export default function DroughtPage() {
  return (
    <>
      <PageHeader
        description="Dry-spell status across the tri-island state."
        title="Drought monitoring"
      />
      <PlaceholderNotice product="The drought status on this page" />
      <PageSection heading="Current status">
        <InfoTable
          headers={["Area", "Status", "Trend"]}
          rows={[
            ["Southern Grenada", "Moderate dryness", "Worsening"],
            ["Northern Grenada", "Mild dryness", "Steady"],
            ["Interior highlands", "Normal", "Steady"],
            ["Carriacou", "Moderate dryness", "Worsening"],
            ["Petite Martinique", "Moderate dryness", "Worsening"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why Carriacou and Petite Martinique are more exposed">
        <Prose
          paragraphs={[
            "Both islands are lower and drier than mainland Grenada and lack the interior highlands that generate orographic rainfall. They also depend more heavily on rainwater harvesting, so a dry spell reaches households faster.",
            "A drought that is an inconvenience on mainland Grenada can be a water supply emergency on Petite Martinique.",
          ]}
        />
      </PageSection>
      <PageSection heading="How drought is assessed">
        <Prose
          paragraphs={[
            "Drought status combines rainfall deficits over several timescales — one month, three months and six months — because short and long dry spells have different consequences. A single dry month is not a drought; a persistent deficit across months is.",
            "Assessment is done with water resources authorities, since the impact depends on storage and demand as much as on rainfall.",
          ]}
        />
      </PageSection>
    </>
  );
}
