import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeadStory } from "./lead-story";

describe("LeadStory", () => {
  it("renders the headline, dek, and meta as a link to the story", () => {
    render(
      <LeadStory
        dek="The five things you need to know."
        eyebrow="Morning Signal"
        heroAlt="Today's brief"
        heroImage="/images/placeholder-green.svg"
        href="/today/2026-06-13"
        meta="Presented by Kenroy Baptiste"
        title="Saharan dust rolls in"
      />
    );

    const heading = screen.getByRole("heading", {
      name: "Saharan dust rolls in",
    });
    expect(heading).toBeInTheDocument();
    expect(
      screen.getByText("The five things you need to know.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Presented by Kenroy Baptiste")
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(
      links.some((a) => a.getAttribute("href") === "/today/2026-06-13")
    ).toBe(true);
  });
});
