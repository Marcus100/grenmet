import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Data & API",
  description: "Machine-readable alerts, forecasts and climate data from GMS.",
};

export default function DataApiPage() {
  return (
    <>
      <PageHeader
        description="Machine-readable alerts, forecasts and climate data."
        title="Data & API"
      />
      <PageSection heading="Open feeds">
        <InfoTable
          caption="Free to use, no key needed"
          headers={["Data", "Format", "Address"]}
          monoColumns={[2]}
          rows={[
            ["Alerts in effect", "RSS (CAP)", "/api/alerts/rss"],
            ["Alert areas", "GeoJSON", "/api/alerts/geojson"],
          ]}
        />
      </PageSection>
      <PageSection heading="On request">
        <Prose
          paragraphs={[
            "Historical observations, climate data and custom datasets are available on request for research, planning and business use. Tell us what you need, for which stations and period, and how you will use it.",
            "Aviation users receive operational products (METAR, TAF, SIGMET) through ICAO channels, not this website.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "CAP alerts",
              href: "/alerts/get-alerts/cap",
              description: "How our alert feeds work",
            },
            {
              name: "Data request form",
              href: "/climate/data-request",
              description: "Ask for climate data",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
