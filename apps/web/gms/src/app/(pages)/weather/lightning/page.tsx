import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Lightning",
  description:
    "Recent lightning around Grenada, Carriacou and Petite Martinique.",
};

export default function LightningPage() {
  return (
    <>
      <PageHeader
        description="Recent lightning strikes around the islands."
        title="Lightning"
      />
      <PlaceholderNotice product="The lightning map" />
      <PageSection heading="Last hour">
        <ImageryFrame
          caption="Lightning detected in the last 60 minutes"
          label="The lightning map will appear here once the detection feed is connected."
        />
      </PageSection>
      <PageSection heading="Reading the map">
        <Prose
          paragraphs={[
            "Each mark is a detected lightning flash; brighter marks are more recent. Lightning within about 15 km means the storm is close enough to be dangerous.",
            "Satellite lightning mappers see flashes over the ocean as well as land, so storms can be tracked long before they reach us.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Lightning safety",
              href: "/alerts/prepare/lightning",
              description: "What to do when thunder roars",
            },
            {
              name: "Radar",
              href: "/weather/radar",
              description: "Rainfall over Grenada right now",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
