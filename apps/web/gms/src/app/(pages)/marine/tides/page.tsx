import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Tide information",
  description: "Predicted high and low water for St. George's and Carriacou.",
};

export default function TidesPage() {
  return (
    <>
      <PageHeader
        description="Predicted high and low water for the tri-island state."
        title="Tide information"
      />
      <PlaceholderNotice product="Tide predictions" />
      <PageSection heading="Tides around Grenada">
        <Prose
          paragraphs={[
            "Grenada has a small tidal range — typically well under a metre between high and low water. Tide alone rarely causes flooding here.",
            "The risk comes from combination: a high spring tide arriving alongside storm surge and heavy rainfall can push water into low-lying parts of St. George's that any one of those alone would not reach.",
          ]}
        />
      </PageSection>
    </>
  );
}
