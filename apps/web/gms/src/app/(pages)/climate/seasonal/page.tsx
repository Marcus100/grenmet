import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Seasonal outlook",
  description:
    "Rainfall and temperature guidance for the months ahead in Grenada.",
};

export default function SeasonalPage() {
  return (
    <>
      <PageHeader
        description="Rainfall and temperature for the months ahead."
        title="Seasonal outlook"
      />
      <PlaceholderNotice product="The seasonal outlook" />
      <PageSection heading="Next three months">
        <InfoTable
          headers={["Element", "Most likely category", "Confidence"]}
          rows={[
            ["Rainfall", "Below normal", "Moderate"],
            ["Mean temperature", "Above normal", "High"],
            ["Dry spell frequency", "Above normal", "Moderate"],
          ]}
        />
      </PageSection>
      <PageSection heading="How to read a seasonal outlook">
        <Prose
          paragraphs={[
            "A seasonal outlook gives the most likely category over a period of months — below, near or above normal. It does not forecast individual days, and a season that comes in below normal overall can still contain a damaging rainfall event.",
            "Seasonal guidance is most useful for decisions made once and lived with for months: water storage, planting, reservoir management, and staffing.",
          ]}
        />
      </PageSection>
      <PageSection heading="Regional context">
        <Prose
          paragraphs={[
            "Seasonal outlooks for Grenada are prepared in the context of regional guidance from the Caribbean Institute for Meteorology and Hydrology, together with the state of the tropical Atlantic and Pacific.",
          ]}
        />
      </PageSection>
    </>
  );
}
