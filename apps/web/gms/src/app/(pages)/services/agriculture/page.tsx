import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Agriculture weather",
  description:
    "Rainfall, dry-spell and planting-window guidance for Grenada's growers.",
};

export default function AgriculturePage() {
  return (
    <>
      <PageHeader
        description="Rainfall and dry-spell outlooks for growers."
        title="Agriculture weather"
      />
      <PlaceholderNotice product="Agricultural guidance on this page" />
      <PageSection heading="Who this is for">
        <Prose
          paragraphs={[
            "Grenada's growers work nutmeg, cocoa, banana, and a wide range of vegetable and root crops, much of it on steep ground where rainfall runs off quickly. Livestock and small-scale poultry operations face their own heat and water constraints.",
            "The weather questions that matter here are rarely about a single day. They are about whether a dry spell is breaking, whether a planting window will hold, and whether the ground is saturated enough that more rain becomes a landslide risk.",
          ]}
        />
      </PageSection>
      <PageSection heading="Rainfall by season">
        <InfoTable
          headers={["Season", "Months", "Character"]}
          rows={[
            [
              "Dry season",
              "January – May",
              "Lower rainfall, higher irrigation demand, elevated fire risk late in the period",
            ],
            [
              "Wet season",
              "June – December",
              "Higher totals, tropical waves and cyclone risk, saturated ground",
            ],
            [
              "Transition",
              "May – June",
              "Onset timing varies year to year and is the key planting decision",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Guidance the service provides">
        <Prose
          paragraphs={[
            "Monthly rainfall summaries by station, seasonal rainfall outlooks, and drought status for the tri-island state. During dry spells these are the products that inform irrigation scheduling and water rationing decisions.",
            "Heavy rainfall warnings carry particular weight for agriculture on slopes, where the risk is soil loss and landslip rather than standing water.",
          ]}
        />
      </PageSection>
    </>
  );
}
