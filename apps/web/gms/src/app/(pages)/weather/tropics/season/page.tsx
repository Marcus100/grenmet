import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Hurricane season",
  description:
    "The Atlantic hurricane season: when it runs, when it peaks, and this season so far.",
};

export default function HurricaneSeasonPage() {
  return (
    <>
      <PageHeader
        description="When the season runs, when it peaks, and this season so far."
        title="Hurricane season"
      />
      <PageSection heading="The season">
        <Prose
          paragraphs={[
            "The Atlantic hurricane season officially runs from 1 June to 30 November. Storms can form outside those dates, but it is rare.",
            "Activity usually peaks from mid-August to mid-October, when the ocean is warmest. Grenada lies at the southern edge of the main hurricane belt: direct hits are less frequent than further north, but Janet (1955), Ivan (2004), Emily (2005) and Beryl (2024) show they do happen.",
          ]}
        />
      </PageSection>
      <PageSection heading="This season so far">
        <PlaceholderNotice compact product="The season summary" />
        <StatTiles
          stats={[
            { label: "Named storms", value: "9" },
            { label: "Hurricanes", value: "4" },
            { label: "Major hurricanes", value: "2" },
            { label: "Affecting Grenada", value: "0" },
          ]}
        />
      </PageSection>
      <PageSection heading="Storm categories">
        <InfoTable
          caption="Saffir–Simpson hurricane wind scale (1-minute sustained winds)"
          headers={["Category", "Winds", "Typical damage"]}
          rows={[
            [
              "Tropical storm",
              "63–118 km/h",
              "Fallen branches, flooding from rain",
            ],
            ["1", "119–153 km/h", "Some roof and tree damage; power cuts"],
            ["2", "154–177 km/h", "Major roof damage; many trees down"],
            [
              "3",
              "178–208 km/h",
              "Devastating: homes damaged, power out for days to weeks",
            ],
            [
              "4",
              "209–251 km/h",
              "Catastrophic: severe damage to well-built homes",
            ],
            ["5", "252 km/h or more", "Catastrophic: many homes destroyed"],
          ]}
        />
      </PageSection>
      <PageSection heading="Be ready">
        <LinkList
          links={[
            {
              name: "Hurricane preparedness",
              href: "/alerts/prepare/hurricane",
              description: "What every household should have ready",
            },
            {
              name: "Historic hurricanes",
              href: "/explore/history/hurricanes",
              description: "The storms that shaped how Grenada prepares",
            },
            {
              name: "Hurricane names",
              href: "/explore/hurricane-names",
              description: "How storms are named",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
