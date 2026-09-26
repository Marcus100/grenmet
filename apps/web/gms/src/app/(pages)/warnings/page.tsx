import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { EndedWarnings } from "@/components/pages/ended-warnings";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts, fetchPastAlerts } from "@/lib/cap";
import { recentlyEnded } from "@/lib/warning-detail";

export const metadata = {
  title: "Warnings in effect",
  description:
    "Every weather warning and advisory in effect for Grenada, Carriacou and Petite Martinique.",
};

export default async function WarningsPage() {
  const [alerts, past] = await Promise.all([
    fetchActiveAlerts(),
    fetchPastAlerts(),
  ]);
  const ended = recentlyEnded(past, new Date());

  return (
    <>
      <PageHeader
        description="Every warning and advisory in effect right now, grouped by hazard."
        title="Warnings in effect"
      />
      <ExerciseBanner result={alerts} />
      <PageSection>
        <AlertGroups result={alerts} />
      </PageSection>
      {ended.length > 0 && (
        <PageSection heading="Ended in the last 24 hours">
          <EndedWarnings ended={ended} />
        </PageSection>
      )}
      <PageSection heading="How to use this page">
        <Prose
          paragraphs={[
            "Warnings are listed by hazard and, within each hazard, most severe first. Select a warning for what to expect, what to do, where and when. A warning stays here until it expires or the Grenada Meteorological Service cancels it, then shows under “Ended” for 24 hours as the all-clear.",
            "This page reflects the CAP feed published by GMS. If the feed cannot be reached, this page says so rather than showing an empty list — an unreachable feed is not the same as an all-clear.",
          ]}
        />
      </PageSection>
    </>
  );
}
