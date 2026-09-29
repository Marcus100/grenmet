import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Historic hurricanes",
  description: "The hurricanes that shaped how Grenada prepares.",
};

export default function HistoricHurricanesPage() {
  return (
    <>
      <PageHeader
        description="The storms that shaped how Grenada prepares."
        title="Historic hurricanes"
      />
      <PageSection heading="Landmark storms">
        <InfoTable
          headers={["Storm", "Date", "What happened"]}
          rows={[
            [
              "Hurricane Janet",
              "22 September 1955",
              "Struck Grenada directly as a major hurricane; the island's deadliest storm of the 20th century",
            ],
            [
              "Hurricane Ivan",
              "7 September 2004",
              "Passed just south of Grenada as a major hurricane; most homes were damaged or destroyed",
            ],
            [
              "Hurricane Emily",
              "14 July 2005",
              "Hit Carriacou and northern Grenada less than a year after Ivan",
            ],
            [
              "Hurricane Beryl",
              "1 July 2024",
              "Made landfall on Carriacou as a Category 4 hurricane, devastating Carriacou and Petite Martinique",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why history matters">
        <Prose
          paragraphs={[
            "Grenada sits at the southern edge of the hurricane belt, and long gaps between direct hits can make a storm feel unlikely. Janet and Ivan came almost 50 years apart. Each time, the lessons were the same: prepare early, know your shelter, and take official alerts seriously.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Cyclone archive",
              href: "/alerts/cyclone/archive",
              description:
                "Past tropical cyclones affecting the tri-island state",
            },
            {
              name: "Hurricane preparedness",
              href: "/alerts/prepare/hurricane",
              description: "What every household should have ready",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
