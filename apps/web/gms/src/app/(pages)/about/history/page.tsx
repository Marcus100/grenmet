import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Our history",
  description:
    "How meteorological observation and forecasting developed in Grenada.",
};

export default function HistoryPage() {
  return (
    <>
      <PageHeader
        description="How meteorological observation and forecasting developed in Grenada."
        title="Our history"
      />
      <PlaceholderNotice product="The dated milestones on this page" />
      <PageSection heading="Milestones">
        <InfoTable
          caption="Dates to be confirmed with the Grenada Meteorological Service before publication"
          headers={["Period", "Development"]}
          rows={[
            [
              "Colonial era",
              "Routine rainfall and temperature observation begins at estate and government stations across Grenada",
            ],
            [
              "Post-independence",
              "A national meteorological service is established with responsibility for public, aviation and marine forecasting",
            ],
            [
              "Airport era",
              "The observing and forecast office is co-located with the international airport at Point Salines",
            ],
            [
              "Regional integration",
              "Grenada joins regional meteorological cooperation through the Caribbean Meteorological Organization",
            ],
            [
              "Digital era",
              "Automatic weather stations, digital product issue and machine-readable warning dissemination",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Events that shaped the service">
        <Prose
          paragraphs={[
            "Hurricane Janet in 1955 struck Grenada directly and remains one of the most severe events in the island's record.",
            "Hurricane Ivan in September 2004 caused catastrophic damage across Grenada, destroying or damaging the large majority of housing stock and devastating the nutmeg industry. It reshaped how the country thinks about warning lead time, building standards and recovery.",
            "Hurricane Beryl in July 2024 passed close to the tri-island state as an exceptionally early major hurricane, causing severe damage on Carriacou and Petite Martinique.",
            "Each of these events changed what the service is expected to deliver — not only the accuracy of a forecast, but how clearly the consequence is communicated and how early it reaches people.",
          ]}
        />
      </PageSection>
      <PageSection heading="A note on this page">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service holds the authoritative account of its own history. The milestones above are a working outline and will be replaced with confirmed dates and detail from the service's records.",
          ]}
        />
      </PageSection>
    </>
  );
}
