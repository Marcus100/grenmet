import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
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
      <PageSection heading="St. George's">
        <InfoTable
          headers={["Tide", "Time (AST)", "Height"]}
          rows={[
            ["High", "03:14", "0.9 m"],
            ["Low", "09:32", "0.2 m"],
            ["High", "15:48", "1.0 m"],
            ["Low", "21:56", "0.2 m"],
          ]}
        />
      </PageSection>
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
