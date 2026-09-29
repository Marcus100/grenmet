import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Rip currents",
  description: "How to spot a rip current and how to escape one.",
};

export default function RipCurrentsPage() {
  return (
    <>
      <PageHeader
        description="Spotting and escaping a rip."
        title="Rip currents"
      />
      <PageSection heading="What a rip current is">
        <Prose
          paragraphs={[
            "A rip current is a narrow, fast channel of water flowing away from the beach. Waves push water up the beach; it has to flow back out, and it concentrates in gaps between sandbars and reefs or beside rocks and jetties.",
            "Rips are strongest on beaches facing the swell, such as Grenada's Atlantic coast, and after long-period swell from distant storms. They can pull even strong swimmers away from shore.",
          ]}
        />
      </PageSection>
      <PageSection heading="How to spot one">
        <Checklist
          items={[
            "A gap in the line of breaking waves.",
            "A channel of darker, calmer-looking or churning water.",
            "Foam, seaweed or sand moving steadily out to sea.",
          ]}
        />
      </PageSection>
      <PageSection heading="If you are caught">
        <Checklist
          items={[
            "Stay calm and float. The rip will not pull you under.",
            "Do not swim against the current.",
            "Swim parallel to the shore until you are out of the pull, then swim back at an angle.",
            "If you cannot escape, float and wave and shout for help.",
          ]}
          ordered
        />
      </PageSection>
      <PageSection heading="If you see someone in trouble">
        <Prose
          paragraphs={[
            "Call for help and throw something that floats. Do not swim out yourself unless you are trained: many people drown trying to rescue others.",
          ]}
        />
      </PageSection>
    </>
  );
}
