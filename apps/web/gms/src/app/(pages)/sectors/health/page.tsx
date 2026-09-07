import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
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
        <InfoTable
          headers={["Category", "Feels-like temperature", "Guidance"]}
          rows={[
            [
              "Caution",
              "32 – 39 °C",
              "Fatigue possible with prolonged exposure",
            ],
            [
              "Extreme caution",
              "39 – 46 °C",
              "Heat cramps and exhaustion possible",
            ],
            [
              "Danger",
              "46 – 54 °C",
              "Heat exhaustion likely; heat stroke possible",
            ],
            ["Extreme danger", "Above 54 °C", "Heat stroke highly likely"],
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
