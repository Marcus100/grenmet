import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Our services",
  description:
    "The full range of meteorological services provided by the Grenada Meteorological Service.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        description="The full range of services GMS provides."
        title="Our services"
      />
      <PageSection heading="Service areas">
        <InfoTable
          headers={["Service", "What it covers", "Primary users"]}
          rows={[
            [
              "Public weather",
              "Daily forecasts, current conditions, outlooks",
              "General public, media, schools",
            ],
            [
              "Warnings and impact-based forecasting",
              "Advisories, watches and warnings with expected impacts",
              "Public, agencies, broadcasters",
            ],
            [
              "Tropical cyclone",
              "Outlooks, local impact bulletins, key messages",
              "Public, disaster management",
            ],
            [
              "Aviation",
              "METAR, SPECI, TAF, aerodrome warnings, briefings",
              "Pilots, airlines, air traffic services",
            ],
            [
              "Marine",
              "Marine forecasts, small craft advisories, swell",
              "Fishers, mariners, ferries, ports",
            ],
            [
              "Climate",
              "Normals, summaries, seasonal outlooks, data requests",
              "Planners, researchers, insurers",
            ],
            [
              "Agriculture",
              "Rainfall outlooks, dry-spell and drought status",
              "Growers, extension services",
            ],
            [
              "Hydrometeorology",
              "Rainfall and flood support",
              "Water resources, disaster management",
            ],
            [
              "Disaster risk support",
              "Briefings and decision support during events",
              "NaDMA, responders",
            ],
            [
              "Health meteorology",
              "Heat, dust and air-quality guidance",
              "Ministry of Health, clinicians",
            ],
            [
              "Tourism and events",
              "Venue and event forecasts",
              "Event organisers, hotels, cruise operators",
            ],
            [
              "Data and digital",
              "Product archive, CAP feed, structured data",
              "Developers, agencies, researchers",
            ],
            [
              "Education and outreach",
              "School material, talks, station visits",
              "Schools, students, community groups",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Which services are live">
        <Prose
          paragraphs={[
            "Not every service listed above is fully available digitally today. Public weather, warnings, tropical cyclone products, aviation and marine are the priority set; climate, agriculture and health services are being built out as the underlying data infrastructure matures.",
            "Where a page on this site carries a sample-content notice, that product is not yet issued from the operational forecast system.",
          ]}
        />
      </PageSection>
    </>
  );
}
