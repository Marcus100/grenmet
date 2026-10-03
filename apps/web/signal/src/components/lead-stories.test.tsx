import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it } from "vitest";
import { LeadStories } from "./lead-stories";

const articles: ComponentProps<typeof LeadStories>["articles"] = [
  {
    title: "Lead story",
    dek: "Lead context",
    section: "check-d-ting",
    slug: "water",
    author: "Verification Desk",
    publishedAt: "2026-06-13",
  },
  {
    title: "Weather story",
    dek: "Weather context",
    section: "weather-ready",
    slug: "dust",
    author: "Weather Desk",
    publishedAt: "2026-06-13",
  },
  {
    title: "Opportunity story",
    dek: "Opportunity context",
    section: "opportunity",
    slug: "scholarship",
    author: "Opportunity Desk",
    publishedAt: "2026-06-12",
  },
];
afterEach(cleanup);
it("preserves story order and moves the series after all three stories", () => {
  const { container } = render(<LeadStories articles={articles} />);
  expect(
    screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent)
  ).toEqual(articles.map((article) => article.title));
  for (const article of articles)
    expect(screen.getByRole("link", { name: article.title })).toHaveAttribute(
      "href",
      `/${article.section}/${article.slug}`
    );
  const series = screen.getByRole("navigation", { name: "More from Signal" });
  expect(within(series).getAllByRole("link")).toHaveLength(4);
  expect(
    within(series).getByRole("link", { name: "Opportunities" })
  ).toHaveAttribute("href", "/opportunity");
  expect(
    within(series).getByRole("link", { name: "Daily Signal" })
  ).toHaveAttribute("href", "/briefs");
  expect(
    within(series).getByRole("link", { name: "Parish Pulse" })
  ).toHaveAttribute("href", "/news-community");
  expect(
    within(series).getByRole("link", { name: "Check D Ting" })
  ).toHaveAttribute("href", "/check-d-ting");
  expect(container.textContent?.indexOf("More from Signal")).toBeGreaterThan(
    container.textContent?.indexOf("Opportunity story") ?? 0
  );
  expect(screen.queryByText("The Signal approach")).not.toBeInTheDocument();
  expect(container.querySelector("aside, img")).toBeNull();
});
it("handles an empty or single-story selection without blank story cards", () => {
  const { rerender, container } = render(<LeadStories articles={[]} />);
  expect(
    screen.getByText("Our first stories are still to come.")
  ).toBeInTheDocument();
  expect(container.querySelectorAll("article")).toHaveLength(0);
  rerender(<LeadStories articles={articles.slice(0, 1)} />);
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(screen.queryByText("Verification Desk")).not.toBeInTheDocument();
});

it("keeps latest stories concise and links to the complete archive", () => {
  render(<LeadStories articles={articles} />);
  expect(
    screen.getByRole("heading", { name: "The Latest" })
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "All stories →" })).toHaveAttribute(
    "href",
    "/archive"
  );
  expect(screen.getByText("Lead context")).toBeInTheDocument();
  expect(screen.queryByText("Weather context")).not.toBeInTheDocument();
  expect(screen.queryByText("Opportunity context")).not.toBeInTheDocument();
});
