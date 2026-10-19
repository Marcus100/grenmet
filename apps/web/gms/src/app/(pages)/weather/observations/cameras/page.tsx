import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Weather cameras",
  description:
    "Live views of sky and sea conditions around Grenada, Carriacou and Petite Martinique.",
};

export default function CamerasPage() {
  return (
    <>
      <PageHeader
        description="Live views of sky and sea conditions."
        title="Weather cameras"
      />
      <PlaceholderNotice product="The camera views on this page" />
      <PageSection heading="What a camera adds">
        <Prose
          paragraphs={[
            "A camera answers the question every other product struggles with: what does it actually look like right now. Cloud base, sea state, whether the rain has reached a place — all of it visible at a glance and understandable without any training.",
            "Cameras also verify. When a warning is issued and a camera shows the conditions arriving, that is evidence for the archive and for post-event review.",
            "During a dust episode, the difference between a light haze and a heavy plume is far clearer in a camera image than in any number.",
          ]}
        />
      </PageSection>
    </>
  );
}
