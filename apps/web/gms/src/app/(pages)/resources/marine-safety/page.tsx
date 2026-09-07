import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Marine safety guidance",
  description:
    "Safety guidance for anyone going on the water around Grenada, Carriacou and Petite Martinique.",
};

export default function MarineSafetyResourcePage() {
  return (
    <>
      <PageHeader
        description="Staying safe on the water."
        title="Marine safety guidance"
      />
      <PageSection heading="Check before you go">
        <Checklist
          items={[
            "The marine forecast for the waters you will actually be in, not just the general outlook.",
            "Whether any small craft advisory is in effect.",
            "The state of the passage if you are crossing to Carriacou or Petite Martinique — it is consistently rougher than either coast.",
          ]}
        />
      </PageSection>
      <PageSection heading="Swimming and the beach">
        <Prose
          paragraphs={[
            "Rip currents are the main danger on Grenada's beaches, and they are strongest during north swell events between December and March — days when the wind is light and the sea looks deceptively calm from the shore.",
            "If caught, do not swim against the current. Swim parallel to the beach to get out of the channel, then come in at an angle. If you cannot break out, float and signal rather than exhausting yourself.",
            "Swim where others are, and never alone.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related pages">
        <LinkList
          links={[
            {
              name: "Marine forecast",
              href: "/marine/forecast",
              description: "Wind, sea state and swell for Grenada waters",
            },
            {
              name: "Small craft advisories",
              href: "/marine/small-craft",
              description: "What is in effect and what it asks of you",
            },
            {
              name: "Marine safety for operators",
              href: "/marine/safety",
              description: "Pre-departure checks and changing conditions",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
