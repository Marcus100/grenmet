import { type PublishedQuestion, TOPIC_LABELS } from "@/lib/cms";

/** Questions grouped by their first topic, in the CMS topic order. */
export function groupByTopic(questions: PublishedQuestion[]) {
  const groups = new Map<string, PublishedQuestion[]>();
  for (const topic of [...Object.keys(TOPIC_LABELS), "other"])
    groups.set(topic, []);
  for (const question of questions) {
    const topic =
      question.topics.find((item) => item in TOPIC_LABELS) ?? "other";
    groups.get(topic)?.push(question);
  }
  return [...groups].filter(([, items]) => items.length > 0);
}
