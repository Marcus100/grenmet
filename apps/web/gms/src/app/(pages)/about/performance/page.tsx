import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Forecast accuracy",
  description: "How well GMS forecasts verify against what actually happened.",
};

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        description="How well our forecasts verify."
        title="Forecast accuracy"
      />
      <PlaceholderNotice product="Forecast verification" />
      <PageSection heading="Last 12 months">
        <StatTiles
          stats={[
            {
              label: "Maximum temperature",
              value: "—",
              detail: "Share of days within 1°C",
            },
            {
              label: "Rain / no rain",
              value: "—",
              detail: "Share of days correct",
            },
            {
              label: "Alerts issued in time",
              value: "—",
              detail: "Lead time before impact",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="How we measure it">
        <Prose
          paragraphs={[
            "Every forecast is compared with what the stations actually recorded: the temperature, whether it rained, and how much. For alerts, we look at whether they were issued early enough to act on and whether the hazard happened.",
            "We publish these results because a forecast service should be accountable, and because the numbers show where we are improving.",
          ]}
        />
      </PageSection>
    </>
  );
}
