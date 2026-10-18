import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Water level sensors",
  description: "River and coastal water level monitoring across Grenada.",
};

export default function WaterLevelsPage() {
  return (
    <>
      <PageHeader
        description="River and coastal water level monitoring."
        title="Water level sensors"
      />
      <PlaceholderNotice product="The water level readings on this page" />
      <PageSection heading="Why level sensors matter here">
        <Prose
          paragraphs={[
            "Grenada's watercourses are short and steep. Rain falling in the interior reaches the coast in minutes, which means a rain gauge upstream and a level sensor downstream together give warning time that neither gives alone.",
            "A level sensor also answers the question a rainfall total cannot: is the water actually rising at the crossing people are about to use.",
          ]}
        />
      </PageSection>
      <PageSection heading="Working with water resources">
        <Prose
          paragraphs={[
            "Water level monitoring is operated jointly with the national water authority and disaster management. The meteorological service contributes the rainfall forecast; the level data informs both flood response and water supply management during dry spells.",
          ]}
        />
      </PageSection>
    </>
  );
}
