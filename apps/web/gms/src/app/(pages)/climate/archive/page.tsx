import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Product archive",
  description:
    "Past forecasts, warnings and bulletins issued by the Grenada Meteorological Service.",
};

export default function ArchivePage() {
  return (
    <>
      <PageHeader
        description="Past forecasts, warnings and bulletins."
        title="Product archive"
      />
      <PlaceholderNotice product="The archive search on this page" />
      <PageSection heading="What is archived">
        <InfoTable
          headers={["Product", "Retained", "Includes"]}
          rows={[
            [
              "Public forecasts",
              "10 years",
              "Full text as issued, with issue time",
            ],
            [
              "Warnings and advisories",
              "10 years",
              "Every version, including amendments and cancellations",
            ],
            [
              "Tropical cyclone bulletins",
              "Permanent",
              "Full bulletin series per system",
            ],
            [
              "Aviation products",
              "Per ICAO requirement",
              "METAR, SPECI, TAF as transmitted",
            ],
            ["Marine forecasts", "10 years", "Full text as issued"],
            [
              "Climate summaries",
              "Permanent",
              "Monthly and seasonal publications",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why the archive matters">
        <Prose
          paragraphs={[
            "An archive is what makes a warning service accountable. After an event, the questions are what was forecast, when the warning was issued, and what it said — and those can only be answered from a record captured at the time.",
            "The archive stores the product exactly as it was published, including versions that were later amended. Amending the record would defeat its purpose.",
          ]}
        />
      </PageSection>
      <PageSection heading="Access">
        <Prose
          paragraphs={[
            "A public archive search is being built. Requests for specific past products can be made through general enquiries in the meantime.",
          ]}
        />
      </PageSection>
    </>
  );
}
