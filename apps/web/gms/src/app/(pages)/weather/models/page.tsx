import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Model guidance",
  description:
    "Numerical weather prediction guidance used by forecasters at the Grenada Meteorological Service.",
};

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        description="The numerical guidance behind the forecast."
        title="Model guidance"
      />
      <PlaceholderNotice product="The model charts on this page" />
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <ImageryFrame
            caption="Surface pressure and precipitation"
            label="Model charts will appear here once a source is connected."
          />
          <ImageryFrame
            caption="Significant wave height"
            label="Wave model charts will appear here once a source is connected."
          />
        </div>
      </PageSection>
      <PageSection heading="Guidance is not the forecast">
        <Prose
          paragraphs={[
            "Models are input, not output. A global model's grid is far coarser than Grenada is wide, so it cannot resolve the difference between the windward and leeward coasts — a difference that dominates the local weather.",
            "The forecaster's job is to interpret that guidance against local behaviour, the observing network and the current satellite picture. Where the published forecast differs from a model chart on this page, the published forecast is the official product.",
          ]}
        />
      </PageSection>
    </>
  );
}
