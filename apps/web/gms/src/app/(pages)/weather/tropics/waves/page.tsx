import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Tropical waves",
  description: "What tropical waves are and how they affect Grenada's weather.",
};

export default function TropicalWavesPage() {
  return (
    <>
      <PageHeader
        description="The disturbances that bring much of our rainy-season weather."
        title="Tropical waves"
      />
      <PageSection heading="What a tropical wave is">
        <Prose
          paragraphs={[
            "A tropical wave is a trough of low pressure, a kink in the easterly trade winds, that drifts westward across the tropical Atlantic. Most form over West Africa and take one to two weeks to cross the ocean.",
            "Dozens cross the Atlantic every year, most of them between June and November, arriving every few days at the peak of the season.",
          ]}
        />
      </PageSection>
      <PageSection heading="What one brings to Grenada">
        <Prose
          paragraphs={[
            "Ahead of a wave the air is often calm, hazy and hot. As the wave axis passes, winds usually shift and cloud, showers and thunderstorms increase, sometimes for a day or more. Behind it, fair weather often returns quickly.",
            "Most waves pass with a spell of showers. Some bring heavy rain and flooding, and a few develop into tropical storms or hurricanes, which is why forecasters watch every one.",
          ]}
        />
      </PageSection>
      <PageSection heading="Follow the tropics">
        <LinkList
          links={[
            {
              name: "Tropical weather outlook",
              href: "/weather/tropics",
              description:
                "Systems that could affect us in the next seven days",
            },
            {
              name: "Satellite",
              href: "/weather/satellite",
              description: "Cloud and storms across the region",
            },
            {
              name: "Hurricane season",
              href: "/weather/tropics/season",
              description: "This season, and what to expect",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
