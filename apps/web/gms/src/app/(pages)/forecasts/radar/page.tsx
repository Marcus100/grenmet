import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Radar",
  description: "Rainfall over Grenada and the surrounding waters.",
};

export default function RadarPage() {
  return (
    <>
      <PageHeader
        description="Rainfall over Grenada right now."
        title="Radar"
      />
      <PlaceholderNotice product="Radar imagery" />
      <PageSection>
        <ImageryFrame
          caption="Radar loop — imagery source not yet connected"
          label="Radar imagery will appear here once a feed is connected."
        />
      </PageSection>
      <PageSection heading="Radar coverage over Grenada">
        <Prose
          paragraphs={[
            "Grenada does not operate its own weather radar. Coverage of the tri-island state comes from regional radars in the Eastern Caribbean, which sit near the edge of their useful range here.",
            "At that distance the beam is high above the surface, so light showers and the lowest part of a rain column can be missed. Radar is best read alongside satellite imagery and station rainfall, not on its own.",
          ]}
        />
      </PageSection>
    </>
  );
}
