import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Tsunami preparedness",
  description: "Know the natural warning signs and where to go.",
};

export default function TsunamiPreparePage() {
  return (
    <>
      <PageHeader
        description="Know the signs and where to go."
        title="Tsunami preparedness"
      />
      <PageSection heading="Why it matters here">
        <Prose
          paragraphs={[
            "Tsunamis are rare in the eastern Caribbean, but the region has active faults and the underwater volcano Kick 'em Jenny lies just north of Grenada. A local tsunami could arrive within minutes, before any official warning.",
          ]}
        />
      </PageSection>
      <PageSection heading="Natural warning signs: act without waiting">
        <Checklist
          items={[
            "A strong earthquake, or one that lasts a long time, while you are near the coast.",
            "The sea suddenly pulling back and exposing the sea floor, or rising unusually fast.",
            "A loud roar from the ocean, like a train or a jet.",
          ]}
        />
      </PageSection>
      <PageSection heading="What to do">
        <Checklist
          items={[
            "Move immediately to high ground or inland; go on foot if roads are blocked.",
            "If you cannot get away from the coast, go to an upper floor of a strong concrete building.",
            "Stay away from the coast until officials say it is safe; the first wave is often not the largest.",
            "Boats in open deep water are safer than in harbour; do not go down to the shore to check on a boat.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Tsunami information",
              href: "/alerts/tsunami",
              description: "Threat levels and alerts in effect",
            },
            {
              name: "Get alerts",
              href: "/alerts/get-alerts",
              description: "Every channel alerts reach you through",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
