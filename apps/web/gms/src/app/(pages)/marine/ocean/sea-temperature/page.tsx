import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Sea temperature",
  description:
    "How warm the sea around Grenada is, and how it compares with normal.",
};

export default function SeaTemperaturePage() {
  return (
    <>
      <PageHeader
        description="How warm the water is, and against normal."
        title="Sea temperature"
      />
      <PlaceholderNotice product="Sea surface temperature" />
      <PageSection heading="Now">
        <StatTiles
          stats={[
            { label: "Grenada waters", value: "29.4°C" },
            {
              label: "Against normal",
              value: "+0.6°C",
              detail: "Warmer than usual",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Why sea temperature matters">
        <Prose
          paragraphs={[
            "Warm water is fuel for tropical storms: hurricanes generally need sea temperatures of about 26.5°C or more to form and strengthen. Around Grenada the sea is warmer than that for much of the year, and warmest from August to October.",
            "Unusually warm water also stresses coral reefs and fisheries, and adds moisture to the air, which can mean heavier downpours.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Coral heat stress",
              href: "/marine/ocean/coral",
              description: "Bleaching risk for Grenada's reefs",
            },
            {
              name: "Hurricane season",
              href: "/weather/tropics/season",
              description: "This season so far",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
