import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Weather records",
  description: "The hottest, wettest and windiest days on record in Grenada.",
};

export default function RecordsPage() {
  return (
    <>
      <PageHeader
        description="Hottest, wettest and windiest on record."
        title="Weather records"
      />
      <PlaceholderNotice product="The records table" />
      <PageSection heading="Station records · MBIA">
        <InfoTable
          headers={["Record", "Value", "Date"]}
          rows={[
            ["Highest temperature", "To be confirmed", "To be confirmed"],
            ["Lowest temperature", "To be confirmed", "To be confirmed"],
            ["Wettest day", "To be confirmed", "To be confirmed"],
            ["Strongest gust", "To be confirmed", "To be confirmed"],
          ]}
        />
      </PageSection>
      <PageSection heading="How records are kept">
        <Prose
          paragraphs={[
            "A record only counts if it was measured by a standard, calibrated instrument at an official station. Records are checked by GMS before they are confirmed, and a longer, unbroken station history makes them more meaningful.",
          ]}
        />
      </PageSection>
    </>
  );
}
