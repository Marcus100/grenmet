import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Health and weather",
  description:
    "Heat, Saharan dust and air-quality guidance for Grenada, Carriacou and Petite Martinique.",
};

export default function HealthPage() {
  return (
    <>
      <PageHeader
        description="Heat, dust and air-quality guidance."
        title="Health and weather"
      />
      <PlaceholderNotice product="Heat and dust guidance on this page" />
      <PageSection heading="Saharan dust">
        <Prose
          paragraphs={[
            "Between roughly May and September, plumes of mineral dust cross the Atlantic from the Sahara and reach the Eastern Caribbean. Concentrations vary from a faint haze to episodes that noticeably reduce visibility and turn the sky milky white.",
            "Dust episodes raise fine particulate levels. People with asthma, COPD, other respiratory conditions, and cardiovascular disease are most affected, and clinics typically see more presentations during and shortly after a significant plume.",
          ]}
        />
      </PageSection>
      <PageSection heading="During a dust episode">
        <Checklist
          items={[
            "Keep reliever inhalers and other prescribed medication to hand.",
            "Close windows on the windward side of the house during the heaviest concentrations.",
            "Reduce strenuous outdoor activity, particularly for children and older adults.",
            "Seek medical attention for worsening breathlessness, wheeze or chest tightness.",
          ]}
        />
      </PageSection>
      <PageSection heading="Heat">
        <Prose
          paragraphs={[
            "On hot, humid days the heat index, the temperature it feels like, is a better guide to risk than the thermometer. Levels and what to do at each are explained on the heat index page.",
          ]}
        />
        <LinkList
          links={[
            {
              name: "Heat index",
              href: "/weather/heat",
              description: "How hot it feels, and when to take care",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Working with the Ministry of Health">
        <Prose
          paragraphs={[
            "Heat and dust guidance is developed alongside health authorities. The meteorological service provides the hazard forecast; health guidance on who is at risk and what to do comes from the Ministry of Health.",
          ]}
        />
      </PageSection>
    </>
  );
}
