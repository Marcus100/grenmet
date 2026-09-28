import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Surface analyses",
  description:
    "Analysed surface charts showing the features driving Grenada's weather.",
};

export default function AnalysesPage() {
  return (
    <>
      <PageHeader
        description="The features driving today's weather, drawn by the forecaster."
        title="Surface analyses"
      />
      <PlaceholderNotice product="The analysis charts on this page" />
      <PageSection>
        <ImageryFrame
          caption="Latest surface analysis — chart source not yet connected"
          label="Analysed surface charts will appear here once a source is connected."
        />
      </PageSection>
      <PageSection heading="What an analysis shows">
        <Prose
          paragraphs={[
            "An analysis is a picture of what the atmosphere is doing now, not what it will do. It marks the features that matter — tropical waves, troughs, ridges, the position of the Atlantic high — from observations rather than from a model.",
            "For Grenada the feature to watch is usually the tropical wave: a westward-moving trough that brings the showery spells making up much of the island's rainfall.",
          ]}
        />
      </PageSection>
      <PageSection heading="Why forecasters still draw them">
        <Prose
          paragraphs={[
            "Drawing the analysis forces a forecaster to reconcile every observation against a single coherent picture. Where observations disagree, the conflict has to be resolved rather than averaged away — which is often where the forecast problem of the day is found.",
          ]}
        />
      </PageSection>
    </>
  );
}
