import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoryListItem } from "./story-list-item";

describe("StoryListItem", () => {
  it("renders the eyebrow, headline, author, and a link to the article", () => {
    render(
      <StoryListItem
        author="Signal Weather Desk"
        eyebrow="Weather Ready"
        href="/weather-ready/saharan-dust"
        publishedAt="2026-06-13"
        title="Saharan dust returns"
      />
    );

    expect(screen.getByText("Weather Ready")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Saharan dust returns" })
    ).toBeInTheDocument();
    expect(screen.getByText("Signal Weather Desk")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Saharan dust returns" })
    ).toHaveAttribute("href", "/weather-ready/saharan-dust");
  });
});
