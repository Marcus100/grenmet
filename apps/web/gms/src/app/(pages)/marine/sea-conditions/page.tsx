import { Measure } from "@/components/measure";
import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";

export const metadata = {
  title: "Sea conditions",
  description:
    "Observed sea state around Grenada, Carriacou and Petite Martinique.",
};

/**
 * Wave heights in metres, shown in the visitor's unit system. Two decimals
 * keep the band edges exact (1.25 m is not 1.3 m).
 */
const HEIGHT = { places: 2, quantity: "height" } as const;

export default function SeaConditionsPage() {
  return (
    <>
      <PageHeader
        description="Observed sea state around the tri-island state."
        title="Sea conditions"
      />
      <PlaceholderNotice product="Observed sea state" />
      <PageSection heading="Sea state scale">
        <InfoTable
          headers={[
            "Description",
            "Wave height",
            "What it means for small craft",
          ]}
          rows={[
            [
              "Smooth",
              <Measure
                key="smooth"
                measure={{ ...HEIGHT, low: 0.5, prefix: "Under " }}
              />,
              "Comfortable for all vessels",
            ],
            [
              "Slight",
              <Measure
                key="slight"
                measure={{ ...HEIGHT, low: 0.5, high: 1.25 }}
              />,
              "Routine operating conditions",
            ],
            [
              "Moderate",
              <Measure
                key="moderate"
                measure={{ ...HEIGHT, low: 1.25, high: 2.5 }}
              />,
              "Uncomfortable in small open boats",
            ],
            [
              "Rough",
              <Measure
                key="rough"
                measure={{ ...HEIGHT, low: 2.5, high: 4 }}
              />,
              "Hazardous for small craft",
            ],
            [
              "Very rough",
              <Measure
                key="very-rough"
                measure={{ ...HEIGHT, low: 4, prefix: "Over " }}
              />,
              "Small craft should remain in port",
            ],
          ]}
        />
      </PageSection>
    </>
  );
}
