import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Nowcast",
  description: "Rainfall and wind expected over Grenada in the next six hours.",
};

export default function NowcastPage() {
  return (
    <>
      <PageHeader
        description="Rainfall and wind expected in the next six hours."
        title="Nowcast"
      />
      <PlaceholderNotice product="The nowcast" />
      <PageSection heading="Next six hours">
        <InfoTable
          headers={["Period", "Rainfall", "Wind", "Confidence"]}
          rows={[
            ["Next hour", "Nil", "NE 14 kt", "High"],
            ["1 – 2 hours", "Light, isolated", "NE 14 kt", "High"],
            [
              "2 – 4 hours",
              "Moderate, scattered",
              "ENE 16 kt gusting 24 kt",
              "Moderate",
            ],
            ["4 – 6 hours", "Light, isolated", "ENE 14 kt", "Moderate"],
          ]}
        />
      </PageSection>
      <PageSection>
        <ImageryFrame
          caption="Short-range model output — model not yet connected"
          label="Nowcast rainfall and wind fields will appear here once the short-range model is connected."
        />
      </PageSection>
      <PageSection heading="What a nowcast is for">
        <Prose
          paragraphs={[
            "A nowcast answers a different question from a forecast: not what the day will be like, but whether the next two hours are usable. It is the right product for deciding whether to start a concrete pour, run a ferry crossing, or hold an outdoor event.",
            "Confidence falls away quickly beyond about three hours. Past six hours, the daily forecast is the better guide.",
          ]}
        />
      </PageSection>
    </>
  );
}
