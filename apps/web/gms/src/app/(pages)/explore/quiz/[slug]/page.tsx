import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { WeatherQuiz } from "@/components/pages/weather-quiz";
import { fetchQuizzes } from "@/lib/cms";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await fetchQuizzes(`discover/${slug}`);
  return { title: result.quizzes[0]?.title ?? "Weather quiz" };
}

/** A quiz written in the CMS, played with the site's quiz component. */
export default async function CmsQuizPage({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await fetchQuizzes(`discover/${slug}`);
  if (result.status === "unavailable")
    return (
      <p className="py-6 text-body-base leading-body-base" role="status">
        This quiz cannot be retrieved right now. Please try again later.
      </p>
    );
  const quiz = result.quizzes[0];
  if (!quiz) notFound();
  return (
    <>
      <PageHeader
        description={quiz.intro ?? `${quiz.questions.length} questions.`}
        title={quiz.title}
      />
      <PageSection>
        <WeatherQuiz
          questions={quiz.questions.map((question) => ({
            question: question.prompt,
            options: question.options,
            answer: question.answer,
            explanation: question.explanation,
          }))}
        />
      </PageSection>
      <Link className="text-gm-blue-ink underline" href="/explore/quiz">
        More weather quizzes
      </Link>
    </>
  );
}
