import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, expect, it, vi } from "vitest";
import { fetchContentBySlug } from "@/lib/cms";
import ArticlePage from "./page";

vi.mock("@/lib/cms", () => ({ fetchContentBySlug: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const params = Promise.resolve({ slug: ["reading-sea-state"] });

it("does not substitute a sample article when CMS is unavailable", async () => {
  vi.mocked(fetchContentBySlug).mockResolvedValue({
    status: "unavailable",
    articles: [],
  });
  render(await ArticlePage({ params }));
  expect(screen.getByRole("status")).toHaveTextContent("cannot be retrieved");
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(notFound).not.toHaveBeenCalled();
});

it("returns not found for an unpublished or absent article, including sample slugs", async () => {
  vi.mocked(fetchContentBySlug).mockResolvedValue({
    status: "ok",
    articles: [],
  });
  await expect(ArticlePage({ params })).rejects.toMatchObject({
    message: "not-found",
  });
});

it("renders only the fetched published article", async () => {
  vi.mocked(fetchContentBySlug).mockResolvedValue({
    status: "ok",
    articles: [
      {
        id: "1",
        section: "latest-from-us",
        category: "Tropical weather outlook",
        relatedLinks: [
          {
            title: "Read the outlook",
            category: "forecast",
            url: "https://weather.gd/forecasts",
          },
        ],
        slug: "reading-sea-state",
        title: "Approved sea guidance",
        summary: "Published summary",
        body: "Current published text",
        imageUrl: null,
        updatedAt: "2026-09-23T12:00:00Z",
      },
    ],
  });
  render(await ArticlePage({ params }));
  expect(
    screen.getByRole("heading", { name: "Approved sea guidance" })
  ).toBeInTheDocument();
  expect(screen.getByText("Current published text")).toBeInTheDocument();
  expect(screen.getByText("Tropical weather outlook")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Read the outlook" })
  ).toHaveAttribute("href", "https://weather.gd/forecasts");
  expect(
    screen.getByRole("link", { name: "More from Latest from us" })
  ).toHaveAttribute("href", "/updates");
});
