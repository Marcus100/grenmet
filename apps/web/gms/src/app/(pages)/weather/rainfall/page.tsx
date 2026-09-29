import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
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
      <PlaceholderNotice product="24-hour rainfall totals" />
      <PageSection heading="Last 24 hours">
        <InfoTable
          caption="Totals to 8:00 AM AST"
          headers={["Station", "Area", "Rain (mm)"]}
          rows={[
            ["Maurice Bishop International (MBIA)", "South-west", "2.4"],
            ["Grand Etang", "Interior", "18.6"],
            ["Grenville", "East", "9.1"],
            ["Lauriston, Carriacou", "Carriacou", "0.0"],
          ]}
        />
      </PageSection>
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
