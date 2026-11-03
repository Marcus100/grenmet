import Link from "next/link";
import { EvidenceComparison } from "@/components/learn/evidence-comparison";
import { eventNational, eventSlug } from "@/data/events";
import { metricEvidence } from "@/data/evidence";
import { data } from "@/data/load";
import { EVENTS } from "@/data/model";
import { PAGE_LEARNING, type PageLearningTopic } from "@/data/page-learning";

export function PageLearning({ topic }: { topic: PageLearningTopic }) {
  const lesson = PAGE_LEARNING[topic];
  const compare = topic === "statistics";
  const rows = compare
    ? EVENTS.filter((event) => event.kind === "general").map((event) => {
        const n = eventNational(data, event.id);
        return {
          id: event.id,
          href: `/elections/${eventSlug(event.id)}`,
          year: event.year,
          votes: n.total,
          seats: Object.values(n.seats).reduce((a, b) => a + b, 0),
          turnout: n.turnout,
          evidence: {
            votes: metricEvidence(data, event.id, "votes"),
            seats: metricEvidence(data, event.id, "seats"),
            turnout: metricEvidence(data, event.id, "turnout"),
          },
        };
      })
    : [];
  return (
    <aside
      aria-label="Reading guide"
      className="text-el-muted mt-4 space-y-3 text-base"
    >
      <details>
        <summary className="cursor-pointer">{lesson.question}</summary>
        <div className="border-el-rule mt-2 max-w-prose space-y-2 border-l-2 pl-3 leading-relaxed">
          <p>{lesson.answer}</p>
          <p>{lesson.caution}</p>
          <Link
            className="inline-block underline underline-offset-4"
            href={`/learn/${lesson.guide}`}
          >
            {lesson.action} →
          </Link>
        </div>
      </details>
      {compare && <EvidenceComparison rows={rows} />}
    </aside>
  );
}
