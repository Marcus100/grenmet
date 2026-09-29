import { cache } from "react";
import { z } from "zod";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/** Editorial only; reports and datasets are FastAPI products. */
export const CONTENT_COLLECTIONS = ["desk-updates", "stories"] as const;
export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

const contentSchema = z.object({
  id: z.string(),
  collection: z.enum(CONTENT_COLLECTIONS),
  title: z.string(),
  slug: z.string(),
  kicker: z.string().nullable().optional(),
  summary: z.string().nullable(),
  category: z.string().nullable().optional(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable().optional(),
  imageCredit: z.string().nullable().optional(),
  imageCaption: z.string().nullable().optional(),
  topics: z.array(z.string()).optional(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  relatedLinks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        category: z.enum([
          "forecast",
          "cap",
          "aviation",
          "bulletin",
          "publication",
          "article",
          "source",
        ]),
        url: z
          .url()
          .max(2000)
          .refine((value) => {
            if (!URL.canParse(value)) return false;
            const url = new URL(value);
            return (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            );
          }),
      })
    )
    .max(20)
    .optional(),
});
export type PublishedContent = z.infer<typeof contentSchema>;

export type ContentResult =
  | { status: "ok"; articles: PublishedContent[] }
  | { status: "unavailable"; articles: [] };

function cmsUrl(path: string) {
  return new URL(path, env.CMS_API_URL);
}
const requestOptions = () => ({
  cache: "no-store" as const,
  signal: AbortSignal.timeout(5000),
});

async function getContent(params: {
  slug?: string;
  collection?: ContentCollection;
}): Promise<ContentResult> {
  if (!env.CMS_API_URL) return { status: "unavailable", articles: [] };
  try {
    const url = cmsUrl("/api/public/articles");
    if (params.collection)
      url.searchParams.set("collection", params.collection);
    if (params.slug) url.searchParams.set("slug", params.slug);
    const response = await fetch(url, requestOptions());
    if (!response.ok) return { status: "unavailable", articles: [] };
    const parsed = z
      .object({ articles: z.array(contentSchema) })
      .safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-cms-contract");
      return { status: "unavailable", articles: [] };
    }
    return { status: "ok", articles: parsed.data.articles };
  } catch (error) {
    reportError(error, "gms-cms");
    return { status: "unavailable", articles: [] };
  }
}

/** Published articles, newest first; all three collections when none given. */
export const fetchPublishedContent = cache(function fetchPublishedContent(
  collection?: ContentCollection
): Promise<ContentResult> {
  return getContent({ collection });
});

export const fetchContentBySlug = cache(function fetchContentBySlug(
  slug: string
): Promise<ContentResult> {
  return getContent({ slug });
});

/** Topic labels; values mirror `TOPICS` in the CMS (`apps/web/cms/src/fields/common.ts`). */
export const TOPIC_LABELS: Record<string, string> = {
  tropical: "Hurricanes and tropical weather",
  rain: "Rain and flooding",
  heat: "Heat and sun",
  marine: "Sea and coast",
  climate: "Climate",
  sky: "Sky and space",
  safety: "Safety and preparedness",
  agriculture: "Farming and water",
  aviation: "Aviation",
  gms: "How GMS works",
};

const questionSchema = z.object({
  id: z.string(),
  question: z.string(),
  slug: z.string(),
  shortAnswer: z.string(),
  body: z.string(),
  topics: z.array(z.string()),
  checkedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  relatedLinks: contentSchema.shape.relatedLinks,
  related: z.array(
    z.object({
      collection: z.enum(["questions", "stories"]),
      title: z.string(),
      slug: z.string(),
    })
  ),
});
export type PublishedQuestion = z.infer<typeof questionSchema>;
export type QuestionsResult =
  | { status: "ok"; questions: PublishedQuestion[] }
  | { status: "unavailable"; questions: [] };

const QUESTION_PREFIX = /^questions\//;

/** `questions/why-…` is served at `/explore/explained/why-…`. */
export const questionHref = (slug: string) =>
  `/explore/explained/${slug.replace(QUESTION_PREFIX, "")}`;

/** Where any related CMS item lives on the site. */
export const relatedHref = (item: PublishedQuestion["related"][number]) =>
  item.collection === "questions"
    ? questionHref(item.slug)
    : contentHref({ collection: item.collection, slug: item.slug });

export const fetchQuestions = cache(async function fetchQuestions(
  params: { slug?: string; topic?: string } = {}
): Promise<QuestionsResult> {
  const unavailable = { status: "unavailable" as const, questions: [] as [] };
  if (!env.CMS_API_URL) return unavailable;
  try {
    const url = cmsUrl("/api/public/questions");
    if (params.slug) url.searchParams.set("slug", params.slug);
    if (params.topic) url.searchParams.set("topic", params.topic);
    const response = await fetch(url, requestOptions());
    if (!response.ok) return unavailable;
    const parsed = z
      .object({ questions: z.array(questionSchema) })
      .safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-cms-questions-contract");
      return unavailable;
    }
    return { status: "ok", questions: parsed.data.questions };
  } catch (error) {
    reportError(error, "gms-cms-questions");
    return unavailable;
  }
});

const partSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), items: z.array(contentSchema) }),
  z.object({ status: z.literal("unavailable") }),
]);
const questionsPartSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), items: z.array(questionSchema) }),
  z.object({ status: z.literal("unavailable") }),
]);
const weatherNowSchema = z.object({
  note: z
    .object({
      text: z.string(),
      postedAt: z.string().nullable(),
      expiresAt: z.string(),
      alertUrl: z.string().nullable(),
    })
    .nullable(),
});
export type WeatherNowContent = z.infer<typeof weatherNowSchema>;

const discoverSchema = z.object({
  today: z.string(),
  onThisDay: z
    .object({
      title: z.string(),
      day: z.number(),
      month: z.number(),
      year: z.number(),
      whatHappened: z.string(),
      imageUrl: z.string().nullable(),
      story: z.object({ title: z.string(), slug: z.string() }).nullable(),
    })
    .nullable(),
  quiz: z
    .object({
      title: z.string(),
      slug: z.string(),
      intro: z.string().nullable(),
      questionCount: z.number(),
    })
    .nullable(),
  fact: z
    .object({
      title: z.string(),
      fact: z.string(),
      source: z.string(),
      sourceUrl: z.string().nullable(),
    })
    .nullable(),
  skyNote: z.object({ title: z.string(), note: z.string() }).nullable(),
});
export type DiscoverContent = z.infer<typeof discoverSchema>;

const quizSchema = z.object({
  title: z.string(),
  slug: z.string(),
  intro: z.string().nullable(),
  questions: z.array(
    z.object({
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answer: z.number().int().min(0),
      explanation: z.string(),
    })
  ),
});
export type PublishedQuiz = z.infer<typeof quizSchema>;

const QUIZ_PREFIX = /^discover\//;
/** `discover/can-you-…` is played at `/explore/quiz/can-you-…`. */
export const quizHref = (slug: string) =>
  `/explore/quiz/${slug.replace(QUIZ_PREFIX, "")}`;

/** Published quizzes with their questions; one when `slug` is given. */
export const fetchQuizzes = cache(async function fetchQuizzes(
  slug?: string
): Promise<{ status: "ok" | "unavailable"; quizzes: PublishedQuiz[] }> {
  const unavailable = { status: "unavailable" as const, quizzes: [] };
  if (!env.CMS_API_URL) return unavailable;
  try {
    const url = cmsUrl("/api/public/quizzes");
    if (slug) url.searchParams.set("slug", slug);
    const response = await fetch(url, requestOptions());
    if (!response.ok) return unavailable;
    const parsed = z
      .object({ quizzes: z.array(quizSchema) })
      .safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-cms-quizzes-contract");
      return unavailable;
    }
    return { status: "ok", quizzes: parsed.data.quizzes };
  } catch (error) {
    reportError(error, "gms-cms-quizzes");
    return unavailable;
  }
});

/** Keys editors can hide in the CMS Homepage settings. */
export type HomeSectionKey =
  | "weather-now"
  | "desk"
  | "stories"
  | "questions"
  | "discover"
  | "reports";

const homeSchema = z.object({
  deskUpdates: partSchema,
  stories: partSchema,
  questions: questionsPartSchema,
  weatherNow: z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok"), items: weatherNowSchema }),
    z.object({ status: z.literal("unavailable") }),
  ]),
  discover: z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok"), items: discoverSchema }),
    z.object({ status: z.literal("unavailable") }),
  ]),
  settings: z.object({
    discoverCards: z.array(z.string()),
    hiddenSections: z.array(z.string()),
  }),
});
export interface HomeContent {
  deskUpdates: ContentResult;
  /** Null when unavailable; the automatic sky card still shows. */
  discover: DiscoverContent | null;
  questions: QuestionsResult;
  settings: { discoverCards: string[]; hiddenSections: string[] };
  stories: ContentResult;
  /** Null when unavailable; the site then uses the issued summary. */
  weatherNow: WeatherNowContent | null;
}

const UNAVAILABLE: ContentResult = { status: "unavailable", articles: [] };
const toResult = (part: z.infer<typeof partSchema>): ContentResult =>
  part.status === "ok" ? { status: "ok", articles: part.items } : UNAVAILABLE;
const ALL_DISCOVER_CARDS = ["sky", "on-this-day", "quiz", "fact"];

/**
 * Everything the homepage reads from the CMS, in one request. Each section
 * keeps its own state, so one failing part never hides the others.
 */
export const fetchHomeContent = cache(
  async function fetchHomeContent(): Promise<HomeContent> {
    const down: HomeContent = {
      deskUpdates: UNAVAILABLE,
      stories: UNAVAILABLE,
      questions: { status: "unavailable", questions: [] },
      weatherNow: null,
      discover: null,
      settings: { discoverCards: ALL_DISCOVER_CARDS, hiddenSections: [] },
    };
    if (!env.CMS_API_URL) return down;
    try {
      const response = await fetch(
        cmsUrl("/api/public/home"),
        requestOptions()
      );
      if (!response.ok) return down;
      const parsed = homeSchema.safeParse(await response.json());
      if (!parsed.success) {
        reportError(parsed.error, "gms-cms-home-contract");
        return down;
      }
      const { data } = parsed;
      return {
        deskUpdates: toResult(data.deskUpdates),
        stories: toResult(data.stories),
        questions:
          data.questions.status === "ok"
            ? { status: "ok", questions: data.questions.items }
            : { status: "unavailable", questions: [] },
        weatherNow:
          data.weatherNow.status === "ok" ? data.weatherNow.items : null,
        discover: data.discover.status === "ok" ? data.discover.items : null,
        settings: data.settings,
      };
    } catch (error) {
      reportError(error, "gms-cms-home");
      return down;
    }
  }
);

/** Whether editors have hidden a homepage section in the CMS. */
export async function isSectionHidden(key: HomeSectionKey): Promise<boolean> {
  const { settings } = await fetchHomeContent();
  return settings.hiddenSections.includes(key);
}

/** Slug prefix (set by the CMS) and site route for each collection. */
const ROUTES: Record<ContentCollection, { prefix: string; base: string }> = {
  "desk-updates": { prefix: "updates/", base: "/explore/updates/" },
  stories: { prefix: "stories/", base: "/explore/news/" },
};

/** `stories/2026/09/x` → `/explore/news/2026/09/x`, and so on. */
export const contentHref = (
  content: Pick<PublishedContent, "collection" | "slug">
) => {
  const { prefix, base } = ROUTES[content.collection];
  return base + content.slug.replace(prefix, "");
};

/** The CMS slug for a route's path segments. */
export const contentSlug = (collection: ContentCollection, parts: string[]) =>
  ROUTES[collection].prefix + parts.join("/");
