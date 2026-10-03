import Link from "next/link";
import { FlagStripe } from "@/components/flag-stripe";
import { EvidenceComparison } from "@/components/learn/evidence-comparison";
import { eventNational, eventSlug } from "@/data/events";
import { metricEvidence } from "@/data/evidence";
import { data } from "@/data/load";
import { EVENTS } from "@/data/model";
import { PAGE_LEARNING, type PageLearningTopic } from "@/data/page-learning";

export function PageLearning({ topic }: { topic: PageLearningTopic }) {
  const lesson = PAGE_LEARNING[topic];
  const compare = ["results", "statistics", "parties", "evidence"].includes(
    topic
  );
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
      aria-label="Understand this page"
      className="mt-6 bg-el-flag-gold-tint"
    >
      <FlagStripe />
      <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
        <div>
          <h2 className="font-semibold font-serif text-lg">
            {lesson.question}
          </h2>
          <p className="mt-2 max-w-prose text-el-ink-2 text-lg leading-relaxed">
            {lesson.answer}
          </p>
        </div>
        <div>
          <p className="text-el-muted text-lg leading-relaxed">
            {lesson.caution}
          </p>
          <Link
            className="mt-3 inline-block font-semibold text-lg underline underline-offset-4"
            href={`/learn/${lesson.guide}`}
          >
            {lesson.action} →
          </Link>
        </div>
      </div>
      {compare && (
        <div className="px-5 pb-5">
          <EvidenceComparison rows={rows} />
        </div>
      )}
    </aside>
  );
}
