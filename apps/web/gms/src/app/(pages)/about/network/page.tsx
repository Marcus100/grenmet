import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Observing network",
  description:
    "Where the Grenada Meteorological Service's observations come from, and how they are used.",
};

export default function NetworkPage() {
  return (
    <>
      <PageHeader
        description="Where our observations come from."
        title="Observing network"
      />
      <PlaceholderNotice product="The station list on this page" />
      <PageSection heading="Stations">
        <InfoTable
          headers={["Station", "Location", "Type", "Elements"]}
          rows={[
            [
              "Point Salines",
              "Maurice Bishop International Airport, St. George's",
              "Synoptic and aviation",
              "Full surface suite",
            ],
            [
              "St. George's",
              "St. George",
              "Automatic",
              "Rain, temperature, wind",
            ],
            ["Pearls", "St. Andrew", "Automatic", "Rain, temperature, wind"],
            [
              "Grand Etang",
              "St. Andrew, interior highland",
              "Automatic",
              "Rain, temperature",
            ],
            [
              "Lauriston",
              "Carriacou",
              "Automatic and aviation",
              "Rain, temperature, wind",
            ],
            ["Petite Martinique", "Petite Martinique", "Rainfall", "Rain"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why the network matters">
        <Prose
          paragraphs={[
            "Grenada's terrain creates large differences over short distances. Grand Etang in the interior highlands receives several times the annual rainfall of the drier southern coastal strip around Point Salines. A single station cannot represent the island.",
            "Network density is what makes a rainfall warning specific enough to act on — the difference between warning the whole country and warning the parishes that will actually flood.",
          ]}
        />
      </PageSection>
      <PageSection heading="Observation standards">
        <Prose
          paragraphs={[
            "Observations follow World Meteorological Organization standards for siting, instrument exposure and reporting, so that Grenada's data is comparable with the regional and global record.",
            "Observations feed the daily forecast, the warning decision, the aviation products, and the national climate record — the same measurement serves all four.",
          ]}
        />
      </PageSection>
    </>
  );
}
