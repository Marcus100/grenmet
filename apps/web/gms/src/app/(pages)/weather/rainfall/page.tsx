import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Rainfall",
  description:
    "Rain totals from the last 24 hours across Grenada's station network.",
};

export default function RainfallPage() {
  return (
    <>
      <PageHeader
        description="Rain totals from the last 24 hours, by station."
        title="Rainfall"
      />
      <PlaceholderNotice
        product="24-hour rainfall totals"
        source={{
          href: "/weather/conditions",
          label: "current conditions at MBIA",
        }}
      />
      <PageSection heading="Why totals vary so much">
        <Prose
          paragraphs={[
            "Moist trade winds rise over Grenada's central mountains, so the interior and the windward east usually get far more rain than the drier south-west, where the airport is. A shower can soak Grand Etang while St. George's stays dry.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Radar",
              href: "/weather/radar",
              description: "Rainfall over Grenada right now",
            },
            {
              name: "Rainfall data",
              href: "/climate/rainfall",
              description: "Monthly and daily totals by station",
            },
            {
              name: "Flood preparedness",
              href: "/alerts/prepare/flood",
              description: "Before, during and after heavy rain",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
