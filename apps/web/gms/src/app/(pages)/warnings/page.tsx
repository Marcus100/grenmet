import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Current alerts",
  description:
    "Every weather warning and advisory in effect for Grenada, Carriacou and Petite Martinique.",
};

export default async function WarningsPage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Every warning and advisory in effect right now, grouped by hazard."
        title="Current alerts"
      />
      <ExerciseBanner result={alerts} />
      <PageSection>
        <AlertGroups result={alerts} />
      </PageSection>
      <PageSection heading="How to use this page">
        <Prose
          paragraphs={[
            "Warnings are listed by hazard and, within each hazard, most severe first. A warning stays on this page until it expires or the Grenada Meteorological Service cancels it.",
            "This page reflects the CAP feed published by GMS. If the feed cannot be reached, this page says so rather than showing an empty list — an unreachable feed is not the same as an all-clear.",
          ]}
        />
      </PageSection>
    </>
  );
}
