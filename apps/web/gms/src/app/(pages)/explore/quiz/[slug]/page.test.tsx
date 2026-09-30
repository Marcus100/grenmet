import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fetchQuizzes } from "@/lib/cms";
import CmsQuizPage from "./page";

vi.mock("@/lib/cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cms")>()),
  fetchQuizzes: vi.fn(),
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
const THUNDER = /Which cloud brings thunder and lightning\?/;
const params = Promise.resolve({ slug: "can-you-name-these-five-clouds" });

it("plays a published CMS quiz", async () => {
  vi.mocked(fetchQuizzes).mockResolvedValue({
    status: "ok",
    quizzes: [
      {
        title: "Can you name these five clouds?",
        slug: "discover/can-you-name-these-five-clouds",
        intro: "Look up before you start.",
        questions: [
          {
            prompt: "Which cloud brings thunder and lightning?",
            options: ["Cumulonimbus", "Cirrus"],
            answer: 0,
            explanation: "Tall storm clouds.",
          },
        ],
      },
    ],
  });
  render(await CmsQuizPage({ params }));
  expect(fetchQuizzes).toHaveBeenCalledWith(
    "discover/can-you-name-these-five-clouds"
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Can you name these five clouds?"
  );
  expect(screen.getByRole("group", { name: THUNDER })).toBeInTheDocument();
});

it("separates an outage from a missing quiz", async () => {
  vi.mocked(fetchQuizzes).mockResolvedValue({
    status: "unavailable",
    quizzes: [],
  });
  render(await CmsQuizPage({ params }));
  expect(screen.getByRole("status")).toHaveTextContent("cannot be retrieved");
});

it("returns not found for an unpublished quiz", async () => {
  vi.mocked(fetchQuizzes).mockResolvedValue({ status: "ok", quizzes: [] });
  await expect(CmsQuizPage({ params })).rejects.toMatchObject({
    message: "not-found",
  });
});
