import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, expect, it, vi } from "vitest";
import { fetchContentBySlug } from "@/lib/cms";
import ArticlePage from "./page";

vi.mock("@/lib/cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cms")>()),
  fetchContentBySlug: vi.fn(),
}));
vi.mock("@/components/featured-link", () => ({
  FeaturedLink: ({ link }: { link: { type: string; ref: string } }) => (
    <p>{`Featured ${link.type}: ${link.ref}`}</p>
  ),
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
        collection: "desk-updates",
        category: "Tropical weather outlook",
        relatedLinks: [
          {
            title: "Read the outlook",
            category: "forecast",
            url: "https://weather.gd/forecasts",
            type: "link",
            ref: null,
            isMain: false,
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
    screen.getByRole("link", { name: "More from From the Desk" })
  ).toHaveAttribute("href", "/explore/updates");
});

it("shows the main link as a card and the others as plain links, building site addresses from the id", async () => {
  vi.mocked(fetchContentBySlug).mockResolvedValue({
    status: "ok",
    articles: [
      {
        id: "1",
        collection: "desk-updates",
        category: "Forecasts",
        relatedLinks: [
          {
            title: "Evening Forecast",
            category: "forecast",
            // Pasted while testing locally: the host must not matter.
            url: "http://localhost:3003/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
            type: "product",
            ref: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
            isMain: true,
          },
          {
            title: "Radar",
            category: "article",
            url: "/weather/radar",
            type: "page",
            ref: "/weather/radar",
            isMain: false,
          },
          {
            title: "Heavy rain for St. George",
            category: "cap",
            url: "/alerts/GMS-1",
            type: "cap",
            ref: "GMS-1",
            isMain: false,
          },
          {
            title: "Met Office",
            category: "source",
            url: "https://www.metoffice.gov.uk/",
            type: "link",
            ref: null,
            isMain: false,
          },
        ],
        slug: "evening-forecast",
        title: "Tonight's forecast",
        summary: "Summary",
        body: "Text",
        imageUrl: null,
        updatedAt: "2026-10-28T12:00:00Z",
      },
    ],
  });
  render(await ArticlePage({ params }));
  expect(
    screen.getByText("Featured product: 0b3c6f1e-1111-4a2b-9c3d-222233334444")
  ).toBeInTheDocument();
  // The main link is not repeated in the plain list.
  expect(
    screen.queryByRole("link", { name: "Evening Forecast" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Radar" })).toHaveAttribute(
    "href",
    "/weather/radar"
  );
  expect(
    screen.getByRole("link", { name: "Heavy rain for St. George" })
  ).toHaveAttribute("href", "/alerts/GMS-1");
  expect(screen.getByRole("link", { name: "Met Office" })).toHaveAttribute(
    "href",
    "https://www.metoffice.gov.uk/"
  );
});
