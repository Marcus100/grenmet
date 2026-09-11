import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Understanding warnings",
  description: "How to read a weather warning from GMS and act on it.",
};

export default function WarningsGuidePage() {
  return (
    <>
      <PageHeader
        description="How to read a warning and act on it."
        title="Understanding warnings"
      />
      <PageSection heading="Advisory, watch, warning">
        <InfoTable
          headers={["Term", "Means", "Do"]}
          rows={[
            [
              "Advisory",
              "Hazardous conditions are possible for some activities",
              "Be aware; monitor updates",
            ],
            [
              "Watch",
              "Hazardous conditions are likely across a broad area",
              "Prepare; review your plans",
            ],
            [
              "Warning",
              "Hazardous conditions are expected or occurring",
              "Take protective action now",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="What a warning tells you">
        <Prose
          paragraphs={[
            "Every warning names the hazard, the area affected, when it starts and ends, how severe it is expected to be, and what you should do. The action line is the part that matters most — it is why the warning was issued.",
            'Warnings also describe expected impacts, not just the weather. "Localised flooding of low-lying roads" tells you more than a rainfall total does.',
          ]}
        />
      </PageSection>
      <PageSection heading="Common misreadings">
        <Prose
          paragraphs={[
            "A warning ending does not mean the hazard has ended. Flooding and landslip continue after the rain stops, and sea state takes time to settle after the wind eases.",
            "No warning does not mean no weather. Ordinary showers and brisk trades sit below warning level and can still disrupt an outdoor plan.",
            "A warning for the tri-island state does not mean every parish sees the same conditions. Read the named areas.",
          ]}
        />
      </PageSection>
      <PageSection heading="Where warnings come from">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service is the official source of weather warnings for Grenada, Carriacou and Petite Martinique. Warnings are published on this site and in a structured Common Alerting Protocol feed used by broadcasters, agencies and alerting apps.",
            "During an event, treat the official feed as authoritative over social media reposts, which are often out of date or altered.",
          ]}
        />
      </PageSection>
    </>
  );
}
