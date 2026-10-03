import { ArrowRightIcon, BadgeCheckIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/pages/prose";
import { fetchQuestions, relatedHref } from "@/lib/cms";

type Params = Promise<{ slug: string }>;

const PARAGRAPH_BREAK = /\n{2,}/;

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
      <p className="py-6 text-body-base leading-body-base" role="status">
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
        <p className="flex items-center gap-2 text-body-sm text-gm-text-secondary leading-body-sm">
          <BadgeCheckIcon
            aria-hidden="true"
            className="size-4 text-gm-blue-ink"
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
            className="font-bold text-gm-heading text-heading-sm leading-heading-sm"
            id="read-next"
          >
            Read next
          </h2>
          <ul className="grid gap-1.5">
            {question.related.map((item) => (
              <li key={`${item.collection}-${item.slug}`}>
                <Link
                  className="inline-flex items-center gap-1 font-semibold text-gm-blue-ink hover:underline"
                  href={relatedHref(item)}
                >
                  {item.title}
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </li>
            ))}
            {question.relatedLinks?.map((link) => (
              <li key={link.url}>
                <a
                  className="font-semibold text-gm-blue-ink hover:underline"
                  href={link.url}
                >
                  {link.title}
                </a>
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
