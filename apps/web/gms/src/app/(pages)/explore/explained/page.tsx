import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { fetchQuestions, questionHref, TOPIC_LABELS } from "@/lib/cms";
import { groupByTopic } from "@/lib/questions";

export const metadata = {
  title: "Questions about the weather",
  description:
    "Plain answers from the Grenada Meteorological Service to the questions people ask about our weather and climate.",
};

export default async function QuestionsPage() {
  const result = await fetchQuestions();
  return (
    <>
      <PageHeader
        description="Plain answers from the forecast desk to the questions people ask about Grenada's weather and climate."
        title="Questions about the weather"
      />
      {result.status === "unavailable" && (
        <p className="py-4 text-body-base leading-body-base" role="status">
          Questions cannot be retrieved right now. Please try again later.
        </p>
      )}
      {result.status === "ok" && result.questions.length === 0 && (
        <p className="py-4 text-body-base leading-body-base">
          No questions are published yet.
        </p>
      )}
      {groupByTopic(result.questions).map(([topic, items]) => (
        <PageSection
          heading={TOPIC_LABELS[topic] ?? "More questions"}
          key={topic}
        >
          <LinkList
            links={items.map((item) => ({
              name: item.question,
              description: item.shortAnswer,
              href: questionHref(item.slug),
            }))}
          />
        </PageSection>
      ))}
    </>
  );
}
