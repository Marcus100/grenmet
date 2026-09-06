import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Marine safety",
  description:
    "Staying safe on the water around Grenada, Carriacou and Petite Martinique.",
};

export default function MarineSafetyPage() {
  return (
    <>
      <PageHeader
        description="Staying safe on the water."
        title="Marine safety"
      />
      <PageSection heading="Before you leave">
        <Checklist
          items={[
            "Check the marine forecast and any advisory in effect — conditions offshore are rarely what they look like from the beach.",
            "Tell someone ashore where you are going and when you expect to be back.",
            "Check fuel, battery and bilge, and carry more fuel than the trip needs.",
            "Carry a lifejacket for every person aboard, and wear them on a crossing.",
            "Carry a means of calling for help that works out of sight of land.",
          ]}
        />
      </PageSection>
      <PageSection heading="Rip currents">
        <Prose
          paragraphs={[
            "Rip currents are the most common cause of drowning on Grenada's beaches. They form where water pushed onto the beach by breaking waves returns seaward through a narrow channel, and they run faster than most people can swim.",
            "If you are caught in one, do not swim against it. Swim parallel to the beach until you are out of the channel, then come in at an angle. If you cannot break out, float and signal.",
            "Rip current risk rises sharply during north swell events, even when the wind is light and the day looks calm.",
          ]}
        />
      </PageSection>
      <PageSection heading="If conditions change while you are out">
        <Checklist
          items={[
            "Head for the nearest sheltered water rather than pressing on to your original destination.",
            "The leeward west coast of Grenada offers shelter from the prevailing north-easterly trades.",
            "Reduce speed in a building sea — taking waves at the wrong angle swamps small open boats.",
          ]}
        />
      </PageSection>
    </>
  );
}
