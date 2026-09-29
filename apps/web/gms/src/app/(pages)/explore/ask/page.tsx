import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Ask a meteorologist",
  description:
    "Send the GMS forecast office a question about Grenada's weather.",
};

export default function AskPage() {
  return (
    <>
      <PageHeader
        description="Curious about Grenada's weather? Ask the people who forecast it."
        title="Ask a meteorologist"
      />
      <PageSection heading="How to ask">
        <Prose
          paragraphs={[
            "Send your question to the forecast office using the contact details on our contact page. We answer a selection of questions in our explainers, so your question may help others too.",
          ]}
        />
      </PageSection>
      <PageSection heading="Good questions">
        <Checklist
          items={[
            "Why does it rain so much more in Grenville than in St. George's?",
            "What does a 60% chance of rain actually mean?",
            "How do you know a tropical wave is coming?",
          ]}
        />
      </PageSection>
      <PageSection heading="Not for this route">
        <Prose
          paragraphs={[
            "For an emergency, call 911. For current alerts and forecasts, use the pages below rather than waiting for a reply.",
          ]}
        />
      </PageSection>
      <PageSection heading="Where to go">
        <LinkList
          links={[
            {
              name: "Contact us",
              href: "/about/contact",
              description: "Send your question to the forecast office",
            },
            {
              name: "All explainers",
              href: "/explore/explained",
              description: "Questions we have already answered",
            },
            {
              name: "Alerts in effect",
              href: "/alerts",
              description: "What is in effect right now",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
