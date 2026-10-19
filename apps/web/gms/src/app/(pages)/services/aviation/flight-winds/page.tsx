import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Flight winds",
  description:
    "Wind and temperature at flight levels across the Eastern Caribbean.",
};

export default function FlightWindsPage() {
  return (
    <>
      <PageHeader
        description="Wind and temperature at flight levels."
        title="Flight winds"
      />
      <PlaceholderNotice product="The flight level data on this page" />
      <PageSection heading="Why the wind turns with height">
        <Prose
          paragraphs={[
            "Near the surface the easterly trades dominate. Higher up, the flow shifts as the trade layer gives way to the upper circulation — which is why a route can have a headwind at one level and a tailwind at another.",
            "The depth of the trade layer varies day to day, and its top is often marked by a temperature inversion that also caps shower development.",
          ]}
        />
      </PageSection>
    </>
  );
}
