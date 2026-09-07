import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Rainfall data",
  description:
    "Monthly and daily rainfall totals by station across the tri-island state.",
};

export default function RainfallPage() {
  return (
    <>
      <PageHeader
        description="Monthly and daily totals by station."
        title="Rainfall data"
      />
      <PlaceholderNotice product="The rainfall figures on this page" />
      <PageSection heading="This month by station">
        <InfoTable
          headers={["Station", "Month to date", "Normal", "Departure"]}
          rows={[
            ["Point Salines", "142 mm", "196 mm", "−54 mm"],
            ["St. George's", "168 mm", "214 mm", "−46 mm"],
            ["Pearls", "221 mm", "248 mm", "−27 mm"],
            ["Grand Etang", "486 mm", "512 mm", "−26 mm"],
            ["Lauriston, Carriacou", "88 mm", "121 mm", "−33 mm"],
          ]}
        />
      </PageSection>
      <PageSection heading="Reading a departure">
        <Prose
          paragraphs={[
            "Departure is the difference between what fell and the long-term normal for that station and month. A negative departure means drier than usual.",
            "Rainfall is highly variable across Grenada, so a departure at one station says little about the rest of the island. Drought assessment uses the whole network together, not any single figure.",
          ]}
        />
      </PageSection>
    </>
  );
}
