import { PageHeader } from "@/components/page-header";
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
