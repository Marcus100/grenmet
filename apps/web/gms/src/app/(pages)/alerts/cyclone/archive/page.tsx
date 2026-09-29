import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Cyclone archive",
  description:
    "Past tropical cyclones affecting Grenada, Carriacou and Petite Martinique.",
};

export default function CycloneArchivePage() {
  return (
    <>
      <PageHeader
        description="Past tropical cyclones affecting the tri-island state."
        title="Cyclone archive"
      />
      <PlaceholderNotice product="The archive listing on this page" />
      <PageSection heading="Significant events">
        <InfoTable
          caption="Details to be confirmed against the official record before publication"
          headers={["System", "Year", "Effect on the tri-island state"]}
          rows={[
            [
              "Hurricane Janet",
              "1955",
              "Direct hit on Grenada; severe loss of life and widespread destruction",
            ],
            [
              "Hurricane Ivan",
              "2004",
              "Catastrophic damage across Grenada; most housing damaged or destroyed, nutmeg industry devastated",
            ],
            [
              "Hurricane Emily",
              "2005",
              "Further damage while recovery from Ivan was still under way",
            ],
            [
              "Hurricane Beryl",
              "2024",
              "Severe damage on Carriacou and Petite Martinique; exceptionally early major hurricane",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="What the archive is for">
        <Prose
          paragraphs={[
            "The archive holds what was forecast, what was warned, and what actually happened. That record is how warning performance is assessed, and how the service learns which impacts were anticipated and which were not.",
            "It is also the evidence base for planning. Engineers, insurers and planners need to know what the tri-island state has actually experienced, not what is typical for the Caribbean as a whole.",
          ]}
        />
      </PageSection>
      <PageSection heading="Southern edge of the belt">
        <Prose
          paragraphs={[
            "Grenada is less frequently struck than islands further north, which has historically shaped local risk perception. Ivan and Beryl are the correction to that: less frequent is not the same as unlikely, and a long quiet run says nothing about the next season.",
          ]}
        />
      </PageSection>
    </>
  );
}
