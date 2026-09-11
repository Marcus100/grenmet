import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";

export const metadata = {
  title: "Significant weather",
  description:
    "Significant weather charts and hazards for flight in the Eastern Caribbean.",
};

export default function SigwxPage() {
  return (
    <>
      <PageHeader
        description="Significant weather across the region."
        title="Significant weather"
      />
      <PlaceholderNotice product="The SIGWX charts on this page" />
      <PageSection>
        <ImageryFrame
          caption="Regional significant weather chart — source not yet connected"
          label="Significant weather charts will appear here once a source is connected."
        />
      </PageSection>
      <PageSection heading="Hazards shown">
        <InfoTable
          headers={["Hazard", "Why it matters"]}
          rows={[
            [
              "Cumulonimbus and thunderstorms",
              "Severe turbulence, icing, hail, lightning and downdraughts",
            ],
            [
              "Turbulence",
              "Injury risk and loss of control; often clear-air and unforecast by sight",
            ],
            [
              "Icing",
              "Loss of lift and added weight in cloud at freezing levels",
            ],
            [
              "Tropical cyclones",
              "Extensive area of severe conditions requiring rerouting",
            ],
            [
              "Volcanic ash",
              "Engine damage; relevant given regional volcanic activity",
            ],
            [
              "Saharan dust",
              "Reduced visibility and possible engine wear at low levels",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Volcanic ash in this region">
        <ImageryFrame
          caption="Volcanic ash advisory area — source not yet connected"
          label="Ash advisories will appear here once a source is connected."
        />
      </PageSection>
    </>
  );
}
