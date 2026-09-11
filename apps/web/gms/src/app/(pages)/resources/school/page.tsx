import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "School resources",
  description:
    "Lesson material and project support on Grenada's weather and climate.",
};

export default function SchoolPage() {
  return (
    <>
      <PageHeader
        description="Lesson material about Grenada's weather."
        title="School resources"
      />
      <PageSection heading="Topics by level">
        <InfoTable
          headers={["Level", "Topics"]}
          rows={[
            [
              "Primary",
              "The water cycle · Clouds and rain · Wind · Staying safe in a storm",
            ],
            [
              "Lower secondary",
              "Why Grenada is hot and wet · Trade winds · Reading a forecast · Warning colours",
            ],
            [
              "Upper secondary / CSEC",
              "Tropical cyclone formation · Rainfall and relief · Climate data and graphs · Hazard mapping",
            ],
            [
              "CAPE",
              "Atmospheric circulation · Climate change in small island states · Data analysis and trends",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Project ideas">
        <Prose
          paragraphs={[
            "Compare rainfall at Grand Etang with Point Salines over a year and explain the difference using relief and the prevailing wind.",
            "Map which parishes were affected by warnings over one hurricane season, and look for a pattern.",
            "Keep a class weather log for a term — rainfall, temperature and cloud — and compare it with the official record for the same period.",
            "Interview family members about Hurricane Ivan in 2004 and compare what they describe with what the record shows.",
          ]}
        />
      </PageSection>
      <PageSection heading="Working with us">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service can arrange talks for schools and visits to the observing station at Point Salines. Students can also request climate data for projects.",
          ]}
        />
      </PageSection>
      <PageSection heading="Start here">
        <LinkList
          links={[
            {
              name: "Weather glossary",
              href: "/resources/glossary",
              description: "The terms used in forecasts and warnings",
            },
            {
              name: "Climate normals",
              href: "/climate/normals",
              description: "What a typical month looks like in Grenada",
            },
            {
              name: "Climate data request",
              href: "/climate/data-request",
              description: "Ask for data for a school project",
            },
            {
              name: "Understanding warnings",
              href: "/resources/warnings-guide",
              description: "How to read a warning and act on it",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
