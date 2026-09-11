import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Nearshore wave model",
  description:
    "High-resolution wave modelling for Grenada's coastal waters, including wave energy flux.",
};

export default function WaveModelPage() {
  return (
    <>
      <PageHeader
        description="High-resolution wave modelling for coastal waters."
        title="Nearshore wave model"
      />
      <PlaceholderNotice product="The wave model output" />
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <ImageryFrame
            caption="Significant wave height"
            label="Model output will appear here once the nearshore model is connected."
          />
          <ImageryFrame
            caption="Wave energy flux"
            label="Model output will appear here once the nearshore model is connected."
          />
        </div>
      </PageSection>
      <PageSection heading="Model runs">
        <InfoTable
          headers={["Run", "Issued", "Covers"]}
          rows={[
            ["04 UTC", "Early morning", "Next 48 hours"],
            ["10 UTC", "Late morning", "Next 48 hours"],
            ["16 UTC", "Afternoon", "Next 48 hours"],
            ["22 UTC", "Overnight", "Next 48 hours"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why nearshore modelling is different">
        <Prose
          paragraphs={[
            "Global wave models work on a grid far coarser than Grenada is wide. They describe the open-ocean swell arriving at the island, but not what that swell does once it reaches shallow water and meets the coastline.",
            "A nearshore model resolves refraction, shoaling and sheltering — why the same offshore swell produces a calm leeward anchorage and dangerous surf on an east-facing beach a few kilometres away.",
          ]}
        />
      </PageSection>
      <PageSection heading="Wave energy flux">
        <Prose
          paragraphs={[
            "Wave energy flux measures the rate at which wave energy arrives at a stretch of coast. It is not a mariner's product — it is a coastal management one.",
            "It indicates where erosion pressure concentrates during a swell event, which informs beach management, coastal infrastructure design and setback planning. It is also the starting point for assessing marine renewable energy potential.",
          ]}
        />
      </PageSection>
    </>
  );
}
