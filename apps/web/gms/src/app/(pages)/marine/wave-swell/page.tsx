import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Wave and swell forecast",
  description:
    "Significant wave height and swell direction for Grenada waters over the next three days.",
};

export default function WaveSwellPage() {
  return (
    <>
      <PageHeader
        description="Significant wave height and swell for the days ahead."
        title="Wave and swell forecast"
      />
      <PlaceholderNotice product="The wave and swell forecast" />
      <PageSection>
        <ImageryFrame
          caption="Nearshore wave model output — model not yet connected"
          label="Wave model output will appear here once the nearshore model is connected."
        />
      </PageSection>
      <PageSection heading="Three-day outlook">
        <InfoTable
          headers={["Day", "Significant height", "Period", "Direction"]}
          rows={[
            ["Today", "1.5–2.0 m", "7 s", "NE"],
            ["Tomorrow", "1.8–2.4 m", "8 s", "NE"],
            ["Day 3", "1.2–1.8 m", "7 s", "ENE"],
          ]}
        />
      </PageSection>
      <PageSection heading="North swell events">
        <Prose
          paragraphs={[
            "Between December and March, distant storms in the North Atlantic can send long-period swell into the Eastern Caribbean. These events arrive with little local wind and can catch people out — the sea builds sharply on north- and west-facing coasts while the day looks calm.",
            "Long-period swell also drives strong rip currents and surge in bays that are normally sheltered.",
          ]}
        />
      </PageSection>
    </>
  );
}
