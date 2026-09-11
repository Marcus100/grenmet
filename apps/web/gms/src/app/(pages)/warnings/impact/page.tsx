import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Impact-based warnings",
  description:
    "What a warning means for you, not just what the weather will do.",
};

export default function ImpactWarningsPage() {
  return (
    <>
      <PageHeader
        description="What a warning means for you, not just what the weather will do."
        title="Impact-based warnings"
      />
      <PageSection heading="Forecasting the consequence, not only the weather">
        <Prose
          paragraphs={[
            "A traditional forecast says what the atmosphere will do. An impact-based warning says what that will mean on the ground — which roads flood, which crossings close, which sea conditions stop a fishing trip.",
            "Every Grenada Meteorological Service warning is built around real hazard likelihood and impact, not meteorological thresholds alone.",
          ]}
        />
      </PageSection>
      <PageSection heading="Likelihood × impact">
        <InfoTable
          caption="The warning level that results from each combination"
          headers={[
            "Likelihood",
            "Minor impact",
            "Moderate impact",
            "Severe impact",
            "Extreme impact",
          ]}
          rows={[
            ["Very high", "Advisory", "Watch", "Warning", "Extreme"],
            ["High", "Advisory", "Watch", "Warning", "Warning"],
            ["Medium", "Green", "Advisory", "Watch", "Warning"],
            ["Low", "Green", "Green", "Advisory", "Watch"],
            ["Very low", "Green", "Green", "Green", "Advisory"],
          ]}
        />
      </PageSection>
      <PageSection heading="Forecaster judgement">
        <Prose
          paragraphs={[
            "The matrix is a guide, not a rule. A duty forecaster may raise or lower a level where operational experience justifies it, and records the reason on the warning.",
            "Local knowledge matters here: a river crossing that has failed twice this season carries a higher impact than its rainfall total alone would suggest.",
          ]}
        />
      </PageSection>
    </>
  );
}
