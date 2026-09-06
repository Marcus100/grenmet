import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Disaster management support",
  description:
    "Hazard briefings and decision support for emergency planners and responders in Grenada.",
};

export default function DisasterManagementPage() {
  return (
    <>
      <PageHeader
        description="Hazard briefings for emergency planners and responders."
        title="Disaster management support"
      />
      <PageSection heading="Who does what">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service forecasts the hazard and issues the warning. The National Disaster Management Agency decides on the response — shelter activation, evacuation, road closure and the all-clear.",
            "The two work from the same information, but the decisions are separate. A weather warning is not itself an instruction to evacuate.",
          ]}
        />
      </PageSection>
      <PageSection heading="Support provided">
        <InfoTable
          headers={["Product", "Purpose", "Timing"]}
          rows={[
            [
              "Pre-event briefing",
              "Expected hazard, timing, confidence and affected districts",
              "Ahead of a forecast event",
            ],
            [
              "Impact bulletin",
              "What the forecast means for people and infrastructure",
              "With the warning",
            ],
            [
              "Situation updates",
              "Change in timing, intensity or affected area",
              "Through the event",
            ],
            [
              "Post-event report",
              "Observed conditions against what was forecast",
              "After the event",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Escalation">
        <Prose
          paragraphs={[
            "During a significant event, the duty forecaster provides direct briefings to the national emergency operations centre rather than relying on published products alone.",
            "Warnings are distributed through the Common Alerting Protocol feed, which is designed for machine consumption by broadcasters, agencies and alerting apps as well as by this website.",
          ]}
        />
      </PageSection>
    </>
  );
}
