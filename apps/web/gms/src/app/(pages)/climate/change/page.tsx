import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Climate change in Grenada",
  description:
    "How Grenada's climate is changing: temperature, rain, sea and storms.",
};

export default function ClimateChangePage() {
  return (
    <>
      <PageHeader
        description="How our climate is changing."
        title="Grenada trends"
      />
      <PageSection heading="The trend at MBIA">
        <PlaceholderNotice compact product="The station trend figures" />
        <StatTiles
          stats={[
            {
              label: "Mean temperature",
              value: "+0.2°C",
              detail: "Per decade",
            },
            { label: "Hot nights", value: "More", detail: "Nights above 26°C" },
          ]}
        />
      </PageSection>
      <PageSection heading="What is changing">
        <Prose
          paragraphs={[
            "The Caribbean, like the rest of the world, is warming. Hotter days and warmer nights are becoming more common, and the sea around us is warmer than it was a few decades ago.",
            "Warmer seas hold more energy and put more moisture into the air. Scientists expect the strongest hurricanes to become more intense and heavy downpours to become heavier, while sea-level rise makes storm surge and coastal flooding reach further inland.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Sea level",
              href: "/climate/change/sea-level",
              description: "Rising seas around the islands",
            },
            {
              name: "Climate normals",
              href: "/climate/normals",
              description: "What a typical month looks like",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
