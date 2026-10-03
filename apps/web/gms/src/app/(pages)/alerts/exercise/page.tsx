import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Exercises and drills",
  description:
    "How the Grenada Meteorological Service marks test warnings during exercises so they are never mistaken for real ones.",
};

export default function ExercisePage() {
  return (
    <>
      <PageHeader
        description="How test warnings are marked during exercises."
        title="Exercises and drills"
      />
      <PageSection heading="Test messages are always marked">
        <Prose
          paragraphs={[
            "During an exercise, every message the Grenada Meteorological Service issues carries the word EXERCISE at the start of the headline, in the message body, and in the structured CAP status field. Warning pages on this site display an exercise banner for the whole duration.",
            "A test warning is never issued without those markings. If you see a warning without them, treat it as real.",
            "Exercise messages are also flagged in the machine-readable feed, so broadcasters and alerting apps can suppress or label them automatically rather than relying on someone reading the text.",
          ]}
        />
      </PageSection>
      <PageSection heading="Regular exercises">
        <InfoTable
          headers={["Exercise", "Hazard", "Typically held"]}
          rows={[
            ["CARIBE WAVE", "Tsunami", "March, region-wide"],
            [
              "National hurricane simulation",
              "Tropical cyclone",
              "Before 1 June",
            ],
            [
              "Internal warning drills",
              "Various",
              "Through the year, unannounced",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why we run them">
        <Prose
          paragraphs={[
            "A warning system is only as good as the last time it was tested end to end — from the forecaster issuing the message, through dissemination, to whether it reached people and whether they knew what to do.",
            "Exercises find the failures that matter while nothing is at stake: a broken distribution list, a channel nobody monitors, a message that was technically correct and practically unclear.",
          ]}
        />
      </PageSection>
    </>
  );
}
