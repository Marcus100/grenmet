import { PageHeader } from "@/components/page-header";
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
