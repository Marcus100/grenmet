import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Careers",
  description:
    "Working at the Grenada Meteorological Service as a meteorologist, met assistant or technician.",
};

export default function CareersPage() {
  return (
    <>
      <PageHeader
        description="Working at the Grenada Meteorological Service."
        title="Careers"
      />
      <PageSection heading="Meteorologist">
        <Prose
          paragraphs={[
            "Meteorologists analyse the atmosphere and issue the forecasts and warnings the country acts on. The work covers the daily public forecast, aviation and marine products, and the warning decision during high-impact events.",
            "The role normally requires a degree in meteorology or a related physical science, followed by professional training meeting the World Meteorological Organization's requirements for meteorologists.",
          ]}
        />
      </PageSection>
      <PageSection heading="Meteorological assistant">
        <Prose
          paragraphs={[
            "Meteorological assistants make and code the observations the whole service depends on, maintain instruments, and support product preparation and dissemination.",
            "The role normally requires strong secondary-level passes in mathematics and a science subject, followed by WMO-aligned training for meteorological technicians.",
          ]}
        />
      </PageSection>
      <PageSection heading="What the work asks of you">
        <Checklist
          items={[
            "Shift work, including nights, weekends and public holidays — the atmosphere does not keep office hours.",
            "Accuracy under time pressure, particularly during a developing event.",
            "Clear communication, because a warning that is not understood has failed regardless of how good the forecast was.",
            "Continuous learning as models, instruments and standards change.",
          ]}
        />
      </PageSection>
      <PageSection heading="Vacancies">
        <Prose
          paragraphs={[
            "Vacancies are advertised through the Government of Grenada public service recruitment process. Enquiries about training pathways and future openings can be sent through general enquiries.",
          ]}
        />
      </PageSection>
    </>
  );
}
