import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { PublishedProducts } from "@/components/pages/published-products";

export const metadata = {
  title: "Fisher's forecast",
  description:
    "Sea state, wind and weather for a day's fishing around Grenada, Carriacou and Petite Martinique.",
};

// The issued marine bulletin is live, so render per request.
export const dynamic = "force-dynamic";

export default function FishingPage() {
  return (
    <>
      <PageHeader
        description="Sea, wind and weather for a day's fishing, from the issued marine forecast."
        title="Fisher's forecast"
      />
      <PageSection heading="Is it safe to go out?">
        <Prose
          paragraphs={[
            "Check the latest marine bulletin below before you leave. If a small craft advisory is in effect, small open boats such as pirogues should stay in port.",
          ]}
        />
      </PageSection>
      <PageSection heading="Latest marine bulletin">
        <PublishedProducts kinds={["marine"]} />
      </PageSection>
      <PageSection heading="Before you leave">
        <Checklist
          items={[
            "Tell someone ashore where you are going and when you will be back.",
            "Carry life jackets for everyone on board, a VHF radio or charged phone in a waterproof bag, and a flare.",
            "Take extra fuel and water; conditions can change faster than the trip back.",
            "Head in at the first sign of a squall line: a dark, low cloud bank with sudden wind.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Small craft advisories",
              href: "/marine/small-craft",
              description: "Advisories in effect for small vessels",
            },
            {
              name: "Tides",
              href: "/marine/tides",
              description: "Predicted high and low water",
            },
            {
              name: "Waves & swell",
              href: "/marine/wave-swell",
              description: "Significant height, period and direction",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
