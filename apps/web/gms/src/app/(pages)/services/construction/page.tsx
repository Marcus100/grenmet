import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Construction weather",
  description:
    "Wind and rain windows for site planning, crane operations and concrete pours in Grenada.",
};

export default function ConstructionPage() {
  return (
    <>
      <PageHeader
        description="Wind and rain windows for site planning."
        title="Construction weather"
      />
      <PlaceholderNotice product="Site planning guidance on this page" />
      <PageSection heading="Decisions weather drives on site">
        <Prose
          paragraphs={[
            "Concrete pours, crane lifts, roofing, scaffold work and excavation on Grenada's steep sites all have their own weather limits. The forecast that matters is not the daily outlook but whether a specific window holds long enough to finish the task safely.",
          ]}
        />
      </PageSection>
      <PageSection heading="Hurricane season and site security">
        <Prose
          paragraphs={[
            "Sites carrying loose material, scaffold and temporary structures need a securing plan that can be executed inside the warning lead time, which is much shorter for a severe thunderstorm than for a tropical cyclone.",
            "Plan for the time it takes to secure the site, not the time until the weather arrives.",
          ]}
        />
      </PageSection>
    </>
  );
}
