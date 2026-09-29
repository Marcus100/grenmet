import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Heat safety",
  description: "Keeping cool and safe on Grenada's hottest days.",
};

export default function HeatPreparePage() {
  return (
    <>
      <PageHeader
        description="Keeping cool on the hottest days."
        title="Heat safety"
      />
      <PageSection heading="Who is most at risk">
        <Prose
          paragraphs={[
            "Heat affects everyone, but older people, babies and young children, people with heart, lung or kidney conditions, and anyone working or exercising outdoors are most at risk.",
          ]}
        />
      </PageSection>
      <PageSection heading="Keep cool">
        <Checklist
          items={[
            "Drink water regularly, before you feel thirsty; limit alcohol and sugary drinks.",
            "Do outdoor work and exercise early in the morning or late in the afternoon.",
            "Rest in shade or a cool room during the hottest part of the day.",
            "Never leave children or pets in a parked car, even for a few minutes.",
            "Check on neighbours and relatives who live alone.",
          ]}
        />
      </PageSection>
      <PageSection heading="Know the signs">
        <InfoTable
          headers={["Condition", "Signs", "What to do"]}
          rows={[
            [
              "Heat exhaustion",
              "Heavy sweating, dizziness, headache, nausea, cramps",
              "Move somewhere cool, drink water, loosen clothing, rest",
            ],
            [
              "Heat stroke",
              "Very high body temperature, confusion, hot dry or damp skin, collapse",
              "Emergency: call 911 now and cool the person while you wait",
            ],
          ]}
        />
      </PageSection>
    </>
  );
}
