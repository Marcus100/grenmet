import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Climate dashboard",
  description: "Rainfall, temperature and the sea around Grenada at a glance.",
};

export default function ClimateDashboardPage() {
  return (
    <>
      <PageHeader
        description="Rain, temperature and sea at a glance."
        title="Climate dashboard"
      />
      <PlaceholderNotice product="The climate dashboard" />
      <PageSection heading="This month">
        <StatTiles
          stats={[
            {
              label: "Rainfall · MBIA",
              value: "86 mm",
              detail: "72% of normal to date",
            },
            {
              label: "Mean temperature",
              value: "+0.8°C",
              detail: "Above normal",
            },
            {
              label: "Sea temperature",
              value: "29.4°C",
              detail: "+0.6°C above normal",
            },
            {
              label: "Dry days · MBIA",
              value: "8",
              detail: "Since the last day with 5 mm",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Go deeper">
        <LinkList
          links={[
            {
              name: "Rainfall data",
              href: "/climate/rainfall",
              description: "Monthly and daily totals by station",
            },
            {
              name: "Temperature data",
              href: "/climate/temperature",
              description: "Highs, lows and averages",
            },
            {
              name: "Drought status",
              href: "/climate/drought",
              description: "Dry-spell status",
            },
            {
              name: "Sea temperature",
              href: "/marine/ocean/sea-temperature",
              description: "How warm the water is",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
