import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Pre-flight briefings",
  description:
    "The pre-flight meteorological briefing service provided to operators in Grenada.",
};

export default function BriefingPage() {
  return (
    <>
      <PageHeader
        description="The pre-flight briefing service for operators."
        title="Pre-flight briefings"
      />
      <PageSection heading="What a briefing covers">
        <Checklist
          items={[
            "Current and forecast conditions at the departure aerodrome.",
            "Conditions at the destination and at nominated alternates.",
            "En-route significant weather, turbulence and icing.",
            "Winds and temperatures at planned flight levels.",
            "Any warnings in effect, including tropical cyclone and volcanic ash.",
          ]}
        />
      </PageSection>
      <PageSection heading="How to obtain one">
        <InfoTable
          headers={["Operator", "Route", "Notice"]}
          rows={[
            [
              "Scheduled commercial",
              "Standing arrangement with the forecast office",
              "Per schedule",
            ],
            [
              "Charter and general aviation",
              "Request to the forecast office",
              "As early as practicable",
            ],
            [
              "Non-scheduled international",
              "Request through operational channels",
              "As early as practicable",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Briefing records">
        <Prose
          paragraphs={[
            "Every briefing is logged — who was briefed, when, and what conditions were reported. The record supports post-incident investigation and demonstrates compliance with ICAO Annex 3.",
            "This public page is not a briefing and must not be used as one.",
          ]}
        />
      </PageSection>
    </>
  );
}
