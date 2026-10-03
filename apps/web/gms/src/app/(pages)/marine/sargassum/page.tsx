import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Sargassum outlook",
  description: "Where sargassum seaweed may reach Grenada's coast.",
};

export default function SargassumPage() {
  return (
    <>
      <PageHeader
        description="Where seaweed may reach the coast."
        title="Sargassum outlook"
      />
      <PlaceholderNotice product="The sargassum outlook" />
      <PageSection heading="Outlook">
        <Prose
          paragraphs={[
            "Moderate amounts of sargassum are expected along the Atlantic-facing east and north-east coasts over the next two weeks. The south-west coast is expected to stay mostly clear.",
          ]}
        />
      </PageSection>
      <PageSection heading="What sargassum is">
        <Prose
          paragraphs={[
            "Sargassum is a floating brown seaweed. Since 2011, very large amounts have grown across the tropical Atlantic, and currents and trade winds carry mats of it into the eastern Caribbean, mostly from spring to autumn.",
            "Grenada's Atlantic coast, including Bathway and Levera, sees the most. Satellites track the mats at sea, which lets us give a few weeks' notice of heavier arrivals.",
          ]}
        />
      </PageSection>
      <PageSection heading="If it washes up near you">
        <Checklist
          items={[
            "Rotting sargassum releases hydrogen sulphide, with a smell like rotten eggs. People with asthma or breathing problems should avoid heavy build-ups.",
            "Swim away from thick mats; they can hide jellyfish and tangle boat propellers.",
            "Fishers: thick mats can block engine cooling intakes and harbour mouths.",
          ]}
        />
      </PageSection>
    </>
  );
}
