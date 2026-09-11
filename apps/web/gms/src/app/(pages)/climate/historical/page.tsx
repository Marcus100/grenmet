import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Historical weather data",
  description:
    "Past observations from Grenada's climate record, and how to obtain them.",
};

export default function HistoricalPage() {
  return (
    <>
      <PageHeader
        description="Past observations back through the record."
        title="Historical weather data"
      />
      <PlaceholderNotice product="The record summary on this page" />
      <PageSection heading="What the record holds">
        <InfoTable
          headers={["Element", "Available from", "Resolution"]}
          rows={[
            ["Rainfall", "Early estate and government records", "Daily"],
            [
              "Temperature",
              "Mid-twentieth century",
              "Daily maximum and minimum",
            ],
            ["Wind", "Airport era", "Hourly"],
            ["Pressure", "Airport era", "Hourly"],
            ["Humidity", "Airport era", "Hourly"],
          ]}
        />
      </PageSection>
      <PageSection heading="Digitisation">
        <Prose
          paragraphs={[
            "A substantial part of Grenada's older record exists on paper. Digitising it makes the long record usable for trend analysis, engineering design and insurance work, and protects it against physical loss.",
            "Where a period is not yet digitised, a data request may still be answerable from the original registers, but takes longer.",
          ]}
        />
      </PageSection>
      <PageSection heading="Getting historical data">
        <Prose
          paragraphs={[
            "Historical data is supplied through the data request process. Requests for research, engineering design, insurance and academic use are all handled the same way.",
          ]}
        />
      </PageSection>
    </>
  );
}
