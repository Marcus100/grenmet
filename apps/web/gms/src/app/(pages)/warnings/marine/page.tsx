import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Marine warnings",
  description:
    "Small craft advisories, rough seas and high surf notices for Grenada waters.",
};

export default async function MarineWarningsPage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Small craft advisories, rough seas and high surf notices."
        title="Marine warnings"
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="In effect now">
        <AlertGroups
          emptyLabel="No marine warning or advisory is in effect for Grenada waters."
          only={["Marine / Small Craft", "Coastal Hazard"]}
          result={alerts}
        />
      </PageSection>
      <PageSection heading="Marine advisory thresholds">
        <InfoTable
          caption="Thresholds used by the Grenada Meteorological Service"
          headers={["Product", "Seas", "Wind"]}
          rows={[
            ["Small Craft Advisory", "2.0 m and above", "20 kt and above"],
            ["High Surf Advisory", "2.5 m breaking surf", "Any"],
            ["Gale Warning", "Any", "34 kt and above"],
            ["Storm Warning", "Any", "48 kt and above"],
          ]}
        />
      </PageSection>
    </>
  );
}
