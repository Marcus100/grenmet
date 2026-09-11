import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { Checklist } from "@/components/pages/checklist";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Tropical cyclone information",
  description:
    "Tropical cyclone watches and warnings for the tri-island state, and what each stage means.",
};

export default async function CyclonePage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Watches and warnings for Grenada, Carriacou and Petite Martinique."
        title="Tropical cyclone information"
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="In effect now">
        <AlertGroups
          emptyLabel="No tropical cyclone watch or warning is in effect for the tri-island state."
          only={["Tropical Cyclone"]}
          result={alerts}
        />
      </PageSection>
      <PageSection heading="What each stage means">
        <Checklist
          items={[
            "Tropical Cyclone Watch — cyclone conditions are possible within 48 hours. Review your plan and secure loose material.",
            "Tropical Cyclone Warning — cyclone conditions are expected within 36 hours. Complete preparations now.",
            "All-clear — issued by the National Disaster Management Agency, not by the arrival of calm weather. The calm in a cyclone's eye is not the end of the event.",
          ]}
        />
      </PageSection>
      <PageSection heading="The Atlantic season">
        <Prose
          paragraphs={[
            "The Atlantic hurricane season runs 1 June to 30 November. Grenada sits at the southern end of the hurricane belt, which lowers but does not remove the risk — Ivan in 2004 and Beryl in 2024 both made a direct impact.",
            "Grenada Meteorological Service issues local watches and warnings. Track forecasts and intensity guidance come from the National Hurricane Centre in Miami.",
          ]}
        />
      </PageSection>
    </>
  );
}
