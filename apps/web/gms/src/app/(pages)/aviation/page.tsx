import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Aviation weather",
  description:
    "Observations, forecasts and briefings for aviation in Grenada, to ICAO Annex 3.",
};

export default function AviationHomePage() {
  return (
    <>
      <PageHeader
        description="Observations, forecasts and briefings for aviation."
        title="Aviation weather"
      />
      <PageSection heading="Aerodromes">
        <InfoTable
          headers={["Aerodrome", "ICAO", "IATA", "Products"]}
          rows={[
            [
              "Maurice Bishop International, Point Salines",
              "TGPY",
              "GND",
              "METAR, SPECI, TAF, aerodrome warnings",
            ],
            ["Lauriston, Carriacou", "TGPZ", "CRU", "METAR, SPECI"],
          ]}
        />
      </PageSection>
      <PageSection heading="Products">
        <LinkList
          links={[
            {
              name: "METAR and TAF",
              href: "/aviation/metar-taf",
              description: "Current observations and terminal forecasts",
            },
            {
              name: "Flight winds",
              href: "/aviation/flight-winds",
              description: "Wind and temperature at flight levels",
            },
            {
              name: "Significant weather",
              href: "/aviation/sigwx",
              description: "Regional significant weather charts",
            },
            {
              name: "Briefings",
              href: "/aviation/briefing",
              description: "Pre-flight briefing service for operators",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Operational use">
        <Prose
          paragraphs={[
            "Nothing on this public website substitutes for an official pre-flight briefing or for current products obtained through operational channels. This section explains what the service provides and how to read it.",
            "Aviation meteorological services in Grenada are provided in accordance with ICAO Annex 3 and the associated WMO technical regulations.",
          ]}
        />
      </PageSection>
    </>
  );
}
