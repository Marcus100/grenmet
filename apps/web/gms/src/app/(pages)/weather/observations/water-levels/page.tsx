import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
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
      <PageSection heading="Current levels">
        <InfoTable
          headers={["Location", "Level", "Status", "Trend"]}
          rows={[
            ["St. John's River", "0.42 m", "Normal", "Steady"],
            ["Great River", "0.61 m", "Normal", "Rising slowly"],
            ["Beausejour gully", "0.18 m", "Normal", "Steady"],
            ["St. George's harbour", "0.35 m", "Normal", "Falling"],
          ]}
        />
      </PageSection>
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
