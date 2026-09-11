import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Warning levels explained",
  description:
    "How the Grenada Meteorological Service colour scale works, and what each level asks you to do.",
};

export default function WarningLevelsPage() {
  return (
    <>
      <PageHeader
        description="How the colour scale works, and what each level asks you to do."
        title="Warning levels explained"
      />
      <PageSection heading="The three levels">
        <InfoTable
          headers={["Level", "Colour", "What it means", "What to do"]}
          rows={[
            [
              "1 — Advisory",
              "Yellow",
              "Conditions are possible that could be hazardous for some users or activities",
              "Be aware; monitor updates",
            ],
            [
              "2 — Watch",
              "Amber",
              "Conditions are likely that could be hazardous for a broad population or area",
              "Prepare; review plans",
            ],
            [
              "3 — Warning",
              "Red",
              "Hazardous conditions are expected or are occurring; impacts are likely",
              "Take protective action now",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Green is a level too">
        <Prose
          paragraphs={[
            "When no advisory, watch or warning is in effect, the tri-island state sits at green. Green does not mean nothing is happening — it means conditions are not expected to reach a level that changes what most people should do.",
            "Ordinary showers, brisk trade winds and normal sea state all sit inside green.",
          ]}
        />
      </PageSection>
      <PageSection heading="Why a warning is not only about rainfall totals">
        <Prose
          paragraphs={[
            "A level is set from hazard likelihood and expected impact together, not from a meteorological threshold alone. The same 50 mm of rain can be a green day on open farmland and a red day over a saturated hillside above St. George's.",
            "This is why two events with similar forecast numbers can carry different warning levels.",
          ]}
        />
      </PageSection>
    </>
  );
}
