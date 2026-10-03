import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Warning levels explained",
  description:
    "How GMS Outlooks, Watches and Warnings relate to the colour scale.",
};

export default function WarningLevelsPage() {
  return (
    <>
      <PageHeader
        description="The product says when and how likely. The colour describes the risk from expected impacts and likelihood."
        title="Warning levels explained"
      />
      <PageSection heading="Three alert products">
        <InfoTable
          headers={["Product", "When GMS uses it", "What to do"]}
          rows={[
            [
              "Outlook",
              "A hazard is being monitored ahead of a possible event",
              "Read the stated impact and likelihood; check for updates",
            ],
            [
              "Watch",
              "A hazardous event is possible or becoming more likely",
              "Prepare for the stated impacts",
            ],
            [
              "Warning",
              "A hazardous event is expected or occurring",
              "Follow the specific instructions in the alert",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Four risk colours">
        <InfoTable
          headers={["Colour", "Response"]}
          rows={[
            ["Green", "No protective action needed now"],
            ["Yellow", "Be aware"],
            ["Orange", "Be prepared"],
            ["Red", "Take action"],
          ]}
        />
      </PageSection>
      <PageSection heading="How product and colour fit together">
        <Prose
          paragraphs={[
            "GMS assesses expected impact and likelihood together to suggest a colour. An Outlook may be green, yellow, orange or red. A Watch or Warning is yellow, orange or red; green means no Watch or Warning is in force.",
            "The product and colour answer different questions. Read the alert's hazard, affected area, timing, expected impacts and instructions together. Colour is always shown with words.",
          ]}
        />
      </PageSection>
    </>
  );
}
