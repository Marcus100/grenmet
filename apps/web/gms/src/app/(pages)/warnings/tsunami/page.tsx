import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { Checklist } from "@/components/pages/checklist";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { fetchActiveAlerts } from "@/lib/cap";

export const metadata = {
  title: "Tsunami information",
  description:
    "Tsunami threat levels for Grenada, how a warning reaches you, and what to do.",
};

export default async function TsunamiPage() {
  const alerts = await fetchActiveAlerts();

  return (
    <>
      <PageHeader
        description="Threat levels, how a warning reaches you, and what to do."
        title="Tsunami information"
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="In effect now">
        <AlertGroups
          emptyLabel="No tsunami message is in effect for Grenada, Carriacou or Petite Martinique."
          only={["Tsunami"]}
          result={alerts}
        />
      </PageSection>
      <PageSection heading="Threat levels">
        <InfoTable
          headers={["Level", "Meaning", "Action"]}
          rows={[
            [
              "Information statement",
              "An earthquake has occurred; no tsunami threat expected",
              "None — stay informed",
            ],
            [
              "Watch",
              "A distant event may produce a tsunami; threat not yet confirmed",
              "Prepare to move; monitor updates",
            ],
            [
              "Advisory",
              "Strong currents or waves dangerous in and near the water",
              "Stay out of the water and off beaches",
            ],
            [
              "Warning",
              "Dangerous inundation is expected or occurring",
              "Move inland and to high ground immediately",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="The natural warning comes first">
        <Prose
          paragraphs={[
            "Grenada sits in a seismically active part of the Eastern Caribbean, close to the Lesser Antilles subduction zone and to the submarine volcano Kick 'em Jenny, a few kilometres north of the island.",
            "For a nearby source there may be no time for an official warning to reach you. The natural signs are the warning: strong ground shaking near the coast, a sudden rise or an unusual withdrawal of the sea, or a loud roar from offshore.",
            "If you observe any of these, move immediately. Do not wait for an official message, and do not go to the shore to look.",
          ]}
        />
      </PageSection>
      <PageSection heading="What to do">
        <Checklist
          items={[
            "Move inland and to high ground on foot if you can — roads jam quickly.",
            "Aim for at least 30 metres above sea level, or 1.6 km inland, whichever you reach first.",
            "Stay there until the official all-clear. Later waves are often larger than the first.",
            "If you are on a boat in deep water, stay offshore — do not return to harbour.",
          ]}
          ordered
        />
      </PageSection>
      <PageSection heading="Who issues what">
        <Prose
          paragraphs={[
            "Tsunami messages for the Caribbean originate from the Pacific Tsunami Warning Center, which acts as the tsunami service provider for the region. The Grenada Meteorological Service and the National Disaster Management Agency relay and act on those messages nationally.",
            "Grenada participates in CARIBE WAVE, the annual regional tsunami exercise. During an exercise, every message is clearly marked as such.",
          ]}
        />
      </PageSection>
    </>
  );
}
