import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Weather by month",
  description: "What to expect from Grenada's weather through the year.",
};

export default function WeatherByMonthPage() {
  return (
    <>
      <PageHeader
        description="What to expect through the year."
        title="Weather by month"
      />
      <PageSection heading="Two seasons">
        <Prose
          paragraphs={[
            "Grenada is warm all year, with only a few degrees between the coolest and warmest months. What changes is the rain: a drier season from about January to May, and a wetter season from about June to December that overlaps the hurricane season.",
          ]}
        />
      </PageSection>
      <PageSection heading="Through the year">
        <InfoTable
          headers={["Months", "Typical weather", "Watch for"]}
          rows={[
            [
              "January–February",
              "Breezy trade winds, passing showers, cooler nights",
              "Rough Atlantic seas on the east coast",
            ],
            [
              "March–May",
              "The driest, sunniest months",
              "Dry spells, bush fires, Saharan dust haze",
            ],
            [
              "June–August",
              "Rainy season begins; tropical waves bring showers",
              "Early-season tropical storms, heat",
            ],
            [
              "September–October",
              "Wettest, most humid months; peak hurricane season",
              "Tropical storms, flooding, landslides",
            ],
            [
              "November–December",
              "Showers ease towards the end of the year",
              "Late-season storms, heavy downpours",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Figures by month">
        <LinkList
          links={[
            {
              name: "Climate normals",
              href: "/climate/normals",
              description: "Average rainfall and temperature for each month",
            },
            {
              name: "Monthly climate summary",
              href: "/climate/monthly",
              description: "How last month compared with normal",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
