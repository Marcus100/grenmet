import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Marine sector services",
  description:
    "Sea state, swell and wind services for fishers, sailors, ferry operators and ports.",
};

export default function MarineSectorPage() {
  return (
    <>
      <PageHeader
        description="Sea state and swell for fishers, sailors and ports."
        title="Marine sector services"
      />
      <PageSection heading="Who this is for">
        <Prose
          paragraphs={[
            "Grenada's marine users span artisanal fishers working from open pirogues, the Carriacou and Petite Martinique ferry services, yacht charter and marina operators, dive operators, and cargo handling at Port Louis and the Grenada Ports Authority.",
            "Each needs a different threshold from the same forecast. A 2-metre sea is routine for a ferry and a stop-work condition for a day's fishing.",
          ]}
        />
      </PageSection>
      <PageSection heading="Products for this sector">
        <LinkList
          links={[
            {
              name: "Marine forecast",
              href: "/marine/forecast",
              description: "Wind, sea state and swell for Grenada waters",
            },
            {
              name: "Coastal waters forecast",
              href: "/marine/coastal",
              description: "Conditions by zone within 12 nautical miles",
            },
            {
              name: "Wave and swell forecast",
              href: "/marine/wave-swell",
              description: "Significant height, period and direction",
            },
            {
              name: "Small craft advisories",
              href: "/marine/small-craft",
              description: "Advisories in effect for small vessels",
            },
            {
              name: "Tide information",
              href: "/marine/tides",
              description: "Predicted high and low water",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
