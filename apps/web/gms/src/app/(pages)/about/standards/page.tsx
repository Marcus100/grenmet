import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Standards and partners",
  description:
    "The international standards GMS works to, and the regional organisations it works with.",
};

export default function StandardsPage() {
  return (
    <>
      <PageHeader
        description="The standards we work to and the partners we work with."
        title="Standards and partners"
      />
      <PageSection heading="Standards">
        <InfoTable
          headers={["Standard", "Applies to"]}
          rows={[
            [
              "WMO technical regulations",
              "Observation, coding and data exchange",
            ],
            [
              "ICAO Annex 3",
              "Meteorological service for international air navigation",
            ],
            [
              "Common Alerting Protocol (CAP)",
              "Structured public warnings for broadcast and machine consumption",
            ],
            ["WIGOS", "Station metadata and observing network registration"],
            ["WIS2", "International exchange of weather data and products"],
          ]}
        />
      </PageSection>
      <PageSection heading="Partners">
        <InfoTable
          headers={["Organisation", "Relationship"]}
          rows={[
            [
              "World Meteorological Organization",
              "Global standards, technical cooperation and capacity building",
            ],
            [
              "Caribbean Meteorological Organization",
              "Regional coordination among Caribbean national services",
            ],
            [
              "Caribbean Institute for Meteorology and Hydrology",
              "Training and regional climate services",
            ],
            [
              "National Hurricane Centre, Miami",
              "Tropical cyclone track and intensity guidance",
            ],
            [
              "National Disaster Management Agency",
              "National warning response and emergency coordination",
            ],
            [
              "Regional national meteorological services",
              "Shared observations, imagery and regional products",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why standards matter here">
        <Prose
          paragraphs={[
            "A small island service depends on data it does not generate itself — satellite imagery, model guidance, regional radar and cyclone forecasts all arrive from partners. Standards are what make that exchange possible.",
            "They also work in the other direction. Grenada's observations contribute to the regional and global record, and are only useful to others if they are made and coded to the same rules.",
          ]}
        />
      </PageSection>
    </>
  );
}
