import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { Checklist } from "@/components/pages/checklist";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Small craft advisories",
  description:
    "Advisories for small vessels operating in Grenada waters, and what they ask of you.",
};

export default async function SmallCraftPage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Advisories for small vessels in Grenada waters."
        title="Small craft advisories"
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="In effect now">
        <AlertGroups
          emptyLabel="No small craft advisory is in effect for Grenada waters."
          only={["Marine / Small Craft"]}
          result={alerts}
        />
      </PageSection>
      <PageSection heading="What counts as a small craft">
        <Prose
          paragraphs={[
            "There is no single length that defines a small craft. It depends on the vessel, its freeboard, its engine and the experience of whoever is aboard. An open fishing pirogue and a well-found 40-foot yacht face very different conditions in the same 2-metre sea.",
            "The advisory tells you the conditions. Judging whether your vessel and crew can handle them is yours to make.",
          ]}
        />
      </PageSection>
      <PageSection heading="When an advisory is in effect">
        <Checklist
          items={[
            "Consider postponing the trip, particularly a crossing to Carriacou or Petite Martinique.",
            "If you go, file a float plan with someone ashore — where you are heading and when you expect to return.",
            "Carry working communications, lifejackets for everyone aboard, and enough fuel to return against the wind.",
            "Expect conditions on the windward side and in the passage to be worse than the leeward coast where you departed.",
          ]}
        />
      </PageSection>
    </>
  );
}
