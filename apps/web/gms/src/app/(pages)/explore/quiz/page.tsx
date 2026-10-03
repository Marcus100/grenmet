import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import {
  type QuizQuestion,
  WeatherQuiz,
} from "@/components/pages/weather-quiz";
import { fetchQuizzes, quizHref } from "@/lib/cms";

export const metadata = {
  title: "Weather quiz",
  description: "Test what you know about Grenada's weather.",
};

const QUESTIONS: QuizQuestion[] = [
  {
    question: "From which direction do Grenada's trade winds usually blow?",
    options: ["East", "West", "North", "South"],
    answer: 0,
    explanation:
      "The trade winds blow from the east for most of the year, which is why the east coast is usually wetter and rougher.",
  },
  {
    question: "When does the Atlantic hurricane season officially run?",
    options: [
      "1 January – 31 May",
      "1 June – 30 November",
      "1 August – 31 October",
      "All year",
    ],
    answer: 1,
    explanation:
      "1 June to 30 November, with the busiest period from mid-August to mid-October.",
  },
  {
    question: "What does a UV index of 11 mean?",
    options: ["Low", "Moderate", "Very high", "Extreme"],
    answer: 3,
    explanation:
      "11 and above is Extreme: unprotected skin can burn in minutes, so avoid the midday sun.",
  },
  {
    question: "You hear thunder at the beach. What should you do?",
    options: [
      "Keep swimming until you see lightning",
      "Shelter under a tree",
      "Get out of the water and go indoors",
      "Lie flat on the sand",
    ],
    answer: 2,
    explanation:
      "If you can hear thunder you can be struck. Get indoors, and wait 30 minutes after the last thunder.",
  },
  {
    question:
      "The sea suddenly pulls far back from the shore. What does it mean?",
    options: [
      "A very low tide",
      "A possible tsunami: move to high ground now",
      "Calm weather ahead",
      "Sargassum is arriving",
    ],
    answer: 1,
    explanation:
      "A sudden retreat of the sea is a natural tsunami warning. Move inland or to high ground at once; do not wait for an official alert.",
  },
];

export default async function QuizPage() {
  const more = await fetchQuizzes();
  return (
    <>
      <PageHeader
        description="Five questions about Grenada's weather. How many can you get?"
        title="Weather quiz"
      />
      <PageSection>
        <WeatherQuiz questions={QUESTIONS} />
      </PageSection>
      {more.quizzes.length > 0 && (
        <PageSection heading="More quizzes">
          <LinkList
            links={more.quizzes.map((quiz) => ({
              name: quiz.title,
              description: quiz.intro ?? `${quiz.questions.length} questions`,
              href: quizHref(quiz.slug),
            }))}
          />
        </PageSection>
      )}
    </>
  );
}
