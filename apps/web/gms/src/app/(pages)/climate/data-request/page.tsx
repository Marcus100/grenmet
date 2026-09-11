import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Climate data request",
  description:
    "How to request climate data from the Grenada Meteorological Service for research, engineering or business use.",
};

export default function DataRequestPage() {
  return (
    <>
      <PageHeader
        description="Ask for climate data for research or business."
        title="Climate data request"
      />
      <PlaceholderNotice product="The online request form" />
      <PageSection heading="What to include in a request">
        <Checklist
          items={[
            "The elements you need — rainfall, temperature, wind, humidity, pressure.",
            "The station or area, and whether a nearby station would be acceptable.",
            "The period, with start and end dates.",
            "The time resolution — daily, monthly or hourly.",
            "What the data is for, which helps us supply the most suitable series.",
            "Your name, organisation and contact details.",
          ]}
        />
      </PageSection>
      <PageSection heading="Turnaround and fees">
        <InfoTable
          headers={["Request type", "Typical turnaround", "Fee"]}
          rows={[
            ["Student or school project", "10 working days", "Normally waived"],
            ["Academic research", "10 working days", "By arrangement"],
            [
              "Commercial, engineering or insurance",
              "10–20 working days",
              "Chargeable",
            ],
            [
              "Data not yet digitised",
              "Longer — advised on request",
              "Chargeable",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Conditions of use">
        <Prose
          paragraphs={[
            "Data supplied by the Grenada Meteorological Service should be acknowledged in any publication, report or design document that uses it.",
            "Supplied data must not be redistributed as a data product without agreement. This protects the integrity of the national record — a partial or altered copy circulating as authoritative causes real harm during an event.",
          ]}
        />
      </PageSection>
      <PageSection heading="How to submit">
        <Prose
          paragraphs={[
            "An online request form is being prepared. Until it is available, send requests through general enquiries with the details listed above.",
          ]}
        />
      </PageSection>
    </>
  );
}
