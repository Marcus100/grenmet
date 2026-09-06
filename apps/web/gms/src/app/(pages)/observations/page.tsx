import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Observations",
  description:
    "Live readings from the Grenada Meteorological Service observing network.",
};

export default function ObservationsPage() {
  return (
    <>
      <PageHeader
        description="Live readings from across the observing network."
        title="Observations"
      />
      <PlaceholderNotice product="The observations on this page" />
      <PageSection heading="Network status">
        <StatTiles
          stats={[
            { label: "Stations reporting", value: "6 of 6" },
            { label: "Last update", value: "16:00 AST" },
            {
              label: "Highest temperature",
              value: "31.6 °C",
              detail: "St. George's",
            },
            {
              label: "Wettest station",
              value: "18.2 mm",
              detail: "Grand Etang, 24 h",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Latest hourly readings">
        <InfoTable
          headers={[
            "Station",
            "Temp",
            "Humidity",
            "Wind",
            "Pressure",
            "Rain 24 h",
          ]}
          rows={[
            [
              "Point Salines",
              "28.0 °C",
              "78%",
              "NE 14 kt",
              "1013.2 hPa",
              "2.4 mm",
            ],
            [
              "St. George's",
              "29.0 °C",
              "74%",
              "NE 10 kt",
              "1013.0 hPa",
              "4.1 mm",
            ],
            ["Pearls", "28.0 °C", "80%", "ENE 12 kt", "1013.1 hPa", "8.6 mm"],
            [
              "Grand Etang",
              "23.0 °C",
              "92%",
              "E 8 kt",
              "1012.8 hPa",
              "18.2 mm",
            ],
            [
              "Lauriston, Carriacou",
              "29.0 °C",
              "72%",
              "NE 16 kt",
              "1013.4 hPa",
              "0.8 mm",
            ],
            ["Petite Martinique", "—", "—", "—", "—", "0.4 mm"],
          ]}
        />
      </PageSection>
      <PageSection heading="Explore the network">
        <LinkList
          links={[
            {
              name: "Stations",
              href: "/observations/stations",
              description: "Every station, what it measures and where it sits",
            },
            {
              name: "Water level sensors",
              href: "/observations/water-levels",
              description: "River and coastal water level monitoring",
            },
            {
              name: "Upper air",
              href: "/observations/upper-air",
              description: "Soundings through the depth of the atmosphere",
            },
            {
              name: "School stations",
              href: "/observations/school-stations",
              description: "Student-run stations adding density to the network",
            },
            {
              name: "Weather cameras",
              href: "/observations/cameras",
              description: "Live views of sky and sea conditions",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
