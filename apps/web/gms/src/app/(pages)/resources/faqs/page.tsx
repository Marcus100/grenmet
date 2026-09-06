import { PageHeader } from "@/components/page-header";
import { FaqList } from "@/components/pages/faq-list";
import { PageSection } from "@/components/pages/page-section";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Common questions about the Grenada Meteorological Service and its forecasts.",
};

export default function FaqsPage() {
  return (
    <>
      <PageHeader
        description="Common questions about our services."
        title="Frequently asked questions"
      />
      <PageSection>
        <FaqList
          entries={[
            {
              question: "How often is the forecast updated?",
              answer:
                "The public forecast is issued twice daily and amended whenever conditions change materially. Warnings are issued and updated at any hour, as conditions require.",
            },
            {
              question: "Why was the forecast wrong for my area?",
              answer:
                "Grenada's terrain creates very different conditions over short distances. A shower over the interior highlands may never reach the southern coast. A forecast covers the whole tri-island state and cannot resolve every valley.",
            },
            {
              question: "Does Grenada have its own weather radar?",
              answer:
                "No. Coverage comes from regional radars in the Eastern Caribbean, and Grenada sits near the edge of their useful range, so light showers can be missed.",
            },
            {
              question: "When is hurricane season?",
              answer:
                "1 June to 30 November. Grenada is at the southern edge of the hurricane belt, which lowers the frequency of direct impacts but does not remove the risk — Ivan in 2004 and Beryl in 2024 both hit the tri-island state.",
            },
            {
              question: "Who issues the all-clear after a storm?",
              answer:
                "The National Disaster Management Agency, not the Grenada Meteorological Service and not the arrival of calm weather. The calm in a hurricane's eye is not the end of the event.",
            },
            {
              question: "How do I get historical weather data?",
              answer:
                "Through the data request process. Student and school requests are normally free; commercial and engineering requests are chargeable.",
            },
            {
              question: "Can I use your forecasts on my website or app?",
              answer:
                "Warnings are published in a structured CAP feed intended for reuse by broadcasters, agencies and app developers. Contact us before republishing forecasts so we can agree how attribution and updates are handled.",
            },
            {
              question:
                "Why does a warning cover areas where nothing happened?",
              answer:
                "Warnings cover where a hazard is expected, and the atmosphere does not respect boundaries precisely. Warning slightly wider than the eventual impact is deliberate — the cost of missing an affected community is far higher than the cost of a warning that did not materialise everywhere.",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
