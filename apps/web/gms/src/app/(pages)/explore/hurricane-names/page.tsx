import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Atlantic hurricane names",
  description:
    "How Atlantic tropical cyclones are named, and what happens when a name is retired.",
};

export default function HurricaneNamesPage() {
  return (
    <>
      <PageHeader
        description="How Atlantic storms are named."
        title="Atlantic hurricane names"
      />
      <PageSection heading="How the lists work">
        <Prose
          paragraphs={[
            "The World Meteorological Organization maintains six rotating lists of Atlantic tropical cyclone names. Each list is used once every six years, so the names in use this season return six seasons later.",
            "Names alternate between those conventionally read as masculine and feminine, and run alphabetically through the season, skipping Q, U, X, Y and Z. A system is named once it reaches tropical storm strength.",
            "If a season runs through the whole list, a supplemental list is used rather than the Greek alphabet, which was discontinued after 2020 because it caused confusion during high-impact events.",
          ]}
        />
      </PageSection>
      <PageSection heading="Retired names">
        <Prose
          paragraphs={[
            "When a storm causes such severe loss of life or damage that reusing its name would be insensitive or confusing, the WMO retires that name permanently and replaces it on the list.",
            "Janet, Ivan and Beryl are all retired Atlantic names, and all three are part of Grenada's own history.",
          ]}
        />
      </PageSection>
      <PageSection heading="Why naming exists at all">
        <Prose
          paragraphs={[
            "A name is easier to communicate, track and remember than a coordinate or a number — which matters when several systems are active at once and a warning has to be unambiguous.",
            "It also carries a risk. A familiar-sounding name can make a dangerous system feel benign. The category and the impact statement, not the name, are what should drive any decision.",
          ]}
        />
      </PageSection>
    </>
  );
}
