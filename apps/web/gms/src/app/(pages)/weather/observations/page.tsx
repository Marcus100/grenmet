import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";
import { fetchCurrentConditions } from "@/lib/products";
import { stationReading } from "@/lib/weather-pages";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Observations",
  description:
    "Live readings from the Grenada Meteorological Service observing network.",
};

export default async function ObservationsPage() {
  const current = await fetchCurrentConditions();
  const reading = stationReading(current?.observation);
  return (
    <>
      <PageHeader
        description="The latest reading from the observing network. Only Maurice Bishop International Airport (MBIA) reports here at present."
        title="Observations"
      />
      {reading ? (
        <PageSection heading="Latest reading">
          <InfoTable
            caption={`${reading.observedAt}${reading.provisional ? " · Provisional, not yet quality checked" : ""}`}
            headers={[
              "Station",
              "Time",
              "Temp",
              "Humidity",
              "Wind",
              "Pressure",
              "Rain",
            ]}
            rows={reading.rows}
          />
        </PageSection>
      ) : (
        <UnavailableNotice
          product={
            current
              ? "No observation has been reported yet, so the latest reading"
              : "The latest observations"
          }
        />
      )}
      <PageSection heading="Explore the network">
        <LinkList
          links={[
            {
              name: "Stations",
              href: "/weather/observations/stations",
              description: "Every station, what it measures and where it sits",
            },
            {
              name: "Water level sensors",
              href: "/weather/observations/water-levels",
              description: "River and coastal water level monitoring",
            },
            {
              name: "Upper air",
              href: "/weather/observations/upper-air",
              description: "Soundings through the depth of the atmosphere",
            },
            {
              name: "School stations",
              href: "/weather/observations/school-stations",
              description: "Student-run stations adding density to the network",
            },
            {
              name: "Weather cameras",
              href: "/weather/observations/cameras",
              description: "Live views of sky and sea conditions",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
