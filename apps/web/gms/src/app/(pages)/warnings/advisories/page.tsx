import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Weather advisories",
  description:
    "Lower-level notices worth planning around, across every hazard.",
};

export default async function AdvisoriesPage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Lower-level notices worth planning around."
        title="Weather advisories"
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="What an advisory is">
        <Prose
          paragraphs={[
            "An advisory covers conditions that are inconvenient or hazardous to some activities, but fall short of the threat a warning carries. Advisories are the right signal for a fisher, a farmer or an event organiser deciding whether to change plans.",
            "A watch means conditions are possible. A warning means they are expected or occurring. An advisory means they are expected and are a nuisance or a limited hazard.",
          ]}
        />
      </PageSection>
      <PageSection heading="In effect now">
        <AlertGroups
          emptyLabel="No advisories are in effect for the tri-island state."
          result={alerts}
        />
      </PageSection>
    </>
  );
}
