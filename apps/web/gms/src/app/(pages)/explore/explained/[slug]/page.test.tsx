import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fetchQuestions } from "@/lib/cms";
import QuestionPage from "./page";

vi.mock("@/lib/cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cms")>()),
  fetchQuestions: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const CHECKED = /Checked by/;
const CHECKED_ON = /Checked by a GMS meteorologist on 20 September 2026/;
const params = Promise.resolve({ slug: "what-is-a-tropical-wave" });
const question = {
  id: "1",
  question: "What is a tropical wave?",
  slug: "questions/what-is-a-tropical-wave",
  shortAnswer: "A ripple in the trade winds.",
  body: "First paragraph.\n\nSecond paragraph.",
  topics: ["tropical"],
  checkedAt: "2026-09-20T15:00:00Z",
  publishedAt: "2026-09-20T15:00:00Z",
  updatedAt: "2026-09-20T15:00:00Z",
  relatedLinks: [],
  related: [
    {
      collection: "questions" as const,
      title: "How are hurricanes named?",
      slug: "questions/how-are-hurricanes-named",
    },
    {
      collection: "stories" as const,
      title: "Waves in September",
      slug: "stories/2026/09/waves",
    },
  ],
};

it("answers first, shows the science check and links related items", async () => {
  vi.mocked(fetchQuestions).mockResolvedValue({
    status: "ok",
    questions: [question],
  });
  render(await QuestionPage({ params }));
  expect(fetchQuestions).toHaveBeenCalledWith({
    slug: "questions/what-is-a-tropical-wave",
  });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "What is a tropical wave?"
  );
  expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  expect(screen.getByText(CHECKED_ON)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "How are hurricanes named?" })
  ).toHaveAttribute("href", "/explore/explained/how-are-hurricanes-named");
  expect(
    screen.getByRole("link", { name: "Waves in September" })
  ).toHaveAttribute("href", "/explore/news/2026/09/waves");
});

it("says nothing about a check that has not happened", async () => {
  vi.mocked(fetchQuestions).mockResolvedValue({
    status: "ok",
    questions: [{ ...question, checkedAt: null }],
  });
  render(await QuestionPage({ params }));
  expect(screen.queryByText(CHECKED)).not.toBeInTheDocument();
});

it("says so when the CMS is unavailable", async () => {
  vi.mocked(fetchQuestions).mockResolvedValue({
    status: "unavailable",
    questions: [],
  });
  render(await QuestionPage({ params }));
  expect(screen.getByRole("status")).toHaveTextContent("cannot be retrieved");
});

it("returns not found for an unpublished question", async () => {
  vi.mocked(fetchQuestions).mockResolvedValue({ status: "ok", questions: [] });
  await expect(QuestionPage({ params })).rejects.toMatchObject({
    message: "not-found",
  });
});
