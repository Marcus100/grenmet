import { Measure } from "@/components/measure";
import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { knotsFromKmh } from "@/lib/units";

export const metadata = {
  title: "Hurricane season",
  description:
    "The Atlantic hurricane season: when it runs, when it peaks, and this season so far.",
};

/** Wind speeds published in km/h, shown in the visitor's unit system. */
function winds(low: number, high?: number) {
  return (
    <Measure
      measure={{
        high: high === undefined ? null : knotsFromKmh(high),
        low: knotsFromKmh(low),
        quantity: "speed",
      }}
    />
  );
}

/** "252 km/h or more", in the visitor's unit system. */
function windsOrMore(low: number) {
  return <>{winds(low)} or more</>;
}

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
      </PageSection>
      <PageSection heading="Storm categories">
        <InfoTable
          caption="Saffir–Simpson hurricane wind scale (1-minute sustained winds)"
          headers={["Category", "Winds", "Typical damage"]}
          rows={[
            [
              "Tropical storm",
              winds(63, 118),
              "Fallen branches, flooding from rain",
            ],
            ["1", winds(119, 153), "Some roof and tree damage; power cuts"],
            ["2", winds(154, 177), "Major roof damage; many trees down"],
            [
              "3",
              winds(178, 208),
              "Devastating: homes damaged, power out for days to weeks",
            ],
            [
              "4",
              winds(209, 251),
              "Catastrophic: severe damage to well-built homes",
            ],
            ["5", windsOrMore(252), "Catastrophic: many homes destroyed"],
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
