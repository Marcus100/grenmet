// The CMS item routes live outside (pages) so a missing item is a real 404,
// not a 200 with "Page not found" (see ./layout.tsx).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchContentBySlug,
  fetchQuestions,
  fetchQuizzes,
  type PublishedContent,
} from "@/lib/cms";
import QuestionPage from "./explore/explained/[slug]/page";
import NewsPage from "./explore/news/[...slug]/page";
import QuizPage from "./explore/quiz/[slug]/page";
import ReportPage from "./explore/reports/[...slug]/page";
import UpdatePage from "./explore/updates/[...slug]/page";

vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  return {
    ...actual,
    fetchContentBySlug: vi.fn(),
    fetchQuestions: vi.fn(),
    fetchQuizzes: vi.fn(),
  };
});

const NOT_FOUND = /404/;
const ARTICLE: PublishedContent = {
  id: "11111111-1111-4111-8111-111111111111",
  collection: "stories",
  title: "A real article",
  slug: "a-real-article",
  summary: "Summary.",
  body: "Body.",
  imageUrl: null,
  updatedAt: "2026-10-29T12:00:00Z",
  publishedAt: "2026-10-28T12:00:00Z",
  linkedProduct: null,
};

const slug = (parts: string[]) => Promise.resolve({ slug: parts });
const one = (name: string) => Promise.resolve({ slug: name });

/** The error a page throws, or null when it renders. */
async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CMS item routes answer 404 for a missing item", () => {
  it.each([
    ["news", () => NewsPage({ params: slug(["no-such-story"]) })],
    ["updates", () => UpdatePage({ params: slug(["no-such-update"]) })],
    ["reports", () => ReportPage({ params: slug(["no-such-report"]) })],
  ])("%s: a missing post is a not-found", async (_name, run) => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [],
    });
    expect(errorMessage(await thrownBy(run))).toMatch(NOT_FOUND);
  });

  it("quiz: a missing quiz is a not-found", async () => {
    vi.mocked(fetchQuizzes).mockResolvedValue({ status: "ok", quizzes: [] });
    const error = await thrownBy(() =>
      QuizPage({ params: one("no-such-quiz") })
    );
    expect(errorMessage(error)).toMatch(NOT_FOUND);
  });

  it("explained: a missing question is a not-found", async () => {
    vi.mocked(fetchQuestions).mockResolvedValue({
      status: "ok",
      questions: [],
    } as Awaited<ReturnType<typeof fetchQuestions>>);
    const error = await thrownBy(() =>
      QuestionPage({ params: one("no-such-question") })
    );
    expect(errorMessage(error)).toMatch(NOT_FOUND);
  });
});

describe("CMS item routes", () => {
  it("render a real post, not a not-found", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "ok",
      articles: [ARTICLE],
    });
    expect(
      await thrownBy(() => NewsPage({ params: slug(["a-real-article"]) }))
    ).toBeNull();
  });

  it("say the CMS cannot be reached, and do not 404, when it is unavailable", async () => {
    vi.mocked(fetchContentBySlug).mockResolvedValue({
      status: "unavailable",
      articles: [],
    });
    expect(
      await thrownBy(() => UpdatePage({ params: slug(["anything"]) }))
    ).toBeNull();
  });
});
