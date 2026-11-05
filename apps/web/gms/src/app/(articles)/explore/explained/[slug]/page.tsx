import { ArrowRightIcon, BadgeCheckIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/pages/prose";
import { RelatedLinkAnchor } from "@/components/related-link-anchor";
import { fetchQuestions, relatedHref } from "@/lib/cms";

type Params = Promise<{ slug: string }>;

const PARAGRAPH_BREAK = /\n{2,}/u;

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await fetchQuestions({ slug: `questions/${slug}` });
  const question = result.questions[0];
  return {
    title: question?.question ?? "Questions about the weather",
    description: question?.shortAnswer,
  };
}

/** One question: the short answer first, then the full explainer. */
export default async function QuestionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await fetchQuestions({ slug: `questions/${slug}` });
  if (result.status === "unavailable")
    return (
      <p className="text-body-base leading-body-base py-6" role="status">
        This answer cannot be retrieved right now. Please try again later.
      </p>
    );
  const question = result.questions[0];
  if (!question) notFound();
  const paragraphs = question.body.split(PARAGRAPH_BREAK).filter(Boolean);

  return (
    <article className="grid gap-6 pb-10">
      <PageHeader
        description={question.shortAnswer}
        title={question.question}
      />
      {question.checkedAt && (
        <p className="text-body-sm text-gm-text-secondary leading-body-sm flex items-center gap-2">
          <BadgeCheckIcon
            aria-hidden="true"
            className="text-gm-blue-ink size-4"
          />
          Checked by a GMS meteorologist on{" "}
          {DAY.format(new Date(question.checkedAt))}
        </p>
      )}
      <Prose paragraphs={paragraphs} />
      {(question.related.length > 0 ||
        Boolean(question.relatedLinks?.length)) && (
        <section aria-labelledby="read-next" className="grid gap-2">
          <h2
            className="text-gm-heading text-heading-sm leading-heading-sm font-bold"
            id="read-next"
          >
            Read next
          </h2>
          <ul className="grid gap-1.5">
            {question.related.map((item) => (
              <li key={`${item.collection}-${item.slug}`}>
                <Link
                  className="text-gm-blue-ink inline-flex items-center gap-1 font-semibold hover:underline"
                  href={relatedHref(item) as Route}
                >
                  {item.title}
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </li>
            ))}
            {question.relatedLinks?.map((link) => (
              <li key={link.url}>
                <RelatedLinkAnchor link={link} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link className="text-gm-blue-ink underline" href="/explore/explained">
        All questions about the weather
      </Link>
    </article>
  );
}
