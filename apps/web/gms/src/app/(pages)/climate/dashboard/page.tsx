import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";

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
