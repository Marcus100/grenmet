import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Lightning safety",
  description: "Staying safe when thunderstorms reach Grenada.",
};

export default function LightningPreparePage() {
  return (
    <>
      <PageHeader
        description="Staying safe when thunder roars."
        title="Lightning safety"
      />
      <PageSection heading="When thunder roars, go indoors">
        <Prose
          paragraphs={[
            "If you can hear thunder, you are close enough to be struck. Lightning can reach several kilometres ahead of a storm, from a sky that still looks clear overhead.",
            "Stay inside until 30 minutes after the last thunder you hear.",
          ]}
        />
      </PageSection>
      <PageSection heading="Safe places">
        <Checklist
          items={[
            "A fully enclosed building with wiring and plumbing.",
            "A hard-topped car or bus with the windows closed.",
            "Not safe: open beaches, open boats, sports fields, sheds, bus shelters and under trees.",
          ]}
        />
      </PageSection>
      <PageSection heading="If you are caught outside">
        <Checklist
          items={[
            "Get off beaches, out of the water and off open boats; head for shore at the first thunder.",
            "Move away from hilltops, tall isolated trees, poles and wire fences.",
            "Keep away from others in your group, so one strike cannot hurt everyone.",
          ]}
        />
      </PageSection>
      <PageSection heading="Indoors">
        <Checklist
          items={[
            "Stay off corded phones and away from plugged-in appliances.",
            "Avoid showers, baths and washing up until the storm passes.",
            "Unplug sensitive electronics before the storm arrives, not during it.",
          ]}
        />
      </PageSection>
    </>
  );
}
