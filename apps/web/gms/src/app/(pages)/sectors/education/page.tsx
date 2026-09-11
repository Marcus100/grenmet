import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Weather for schools",
  description:
    "Classroom resources, station visits and student material on Grenada's weather and climate.",
};

export default function EducationPage() {
  return (
    <>
      <PageHeader
        description="Weather resources for schools and students."
        title="Weather for schools"
      />
      <PageSection heading="What we offer schools">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service supports teaching about weather and climate through classroom material, talks, and visits to the observing station at Point Salines.",
            "Students working on CSEC and CAPE geography projects can request climate data for Grenada, Carriacou and Petite Martinique through the data request process.",
          ]}
        />
      </PageSection>
      <PageSection heading="Topics we cover">
        <Prose
          paragraphs={[
            "How a forecast is made, from observation through model guidance to the forecaster's judgement. Why the windward and leeward coasts of Grenada have such different weather. How tropical waves become tropical cyclones. What the warning colours mean and how a household should act on them.",
          ]}
        />
      </PageSection>
      <PageSection heading="Where to start">
        <LinkList
          links={[
            {
              name: "School resources",
              href: "/resources/school",
              description: "Lesson material about Grenada's weather",
            },
            {
              name: "Weather glossary",
              href: "/resources/glossary",
              description: "The terms used in forecasts and warnings",
            },
            {
              name: "Understanding warnings",
              href: "/resources/warnings-guide",
              description: "How to read a warning and act on it",
            },
            {
              name: "Climate normals",
              href: "/climate/normals",
              description: "What a typical month looks like in Grenada",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
