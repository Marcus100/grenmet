import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TrendsPage from "@/app/trends/page";

vi.mock("server-only", () => ({}));

describe("Election explainer", () => {
  // This whole-page render shares CI workers with the other application suites.
  it("renders every chart with reading guidance and source caveats", {
    timeout: 20_000,
  }, () => {
    const { container } = render(<TrendsPage />);
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: "How to read an election",
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { hidden: true, name: "How to read it" })
    ).toHaveLength(7);
    expect(screen.getAllByText("What the terms mean")).toHaveLength(7);
    expect(
      screen.getAllByRole("heading", { hidden: true, name: "A worked example" })
    ).toHaveLength(7);
    expect(
      screen.getAllByRole("heading", { hidden: true, name: "What stands out" })
    ).toHaveLength(7);
    expect(
      screen.getAllByRole("heading", { hidden: true, name: "Keep in mind" })
    ).toHaveLength(7);
    const navigation = screen.getByRole("navigation", {
      name: "Explore the election explainer",
    });
    for (const link of navigation.querySelectorAll("a")) {
      const target = link.getAttribute("href")?.slice(1);
      expect(target && document.getElementById(target)).toBeTruthy();
    }
    expect(container.querySelectorAll("details").length).toBeGreaterThanOrEqual(
      10
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: "Try explaining it yourself",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Turnout methods differ between years, so these figures are not an exact like-for-like comparison."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Election 1951" })).toHaveAttribute(
      "href",
      "/elections/1951"
    );
    for (const element of container.querySelectorAll<HTMLElement>("[style]")) {
      if (element.style.width.endsWith("%")) {
        expect(Number.parseFloat(element.style.width)).toBeLessThanOrEqual(100);
      }
    }
  });
});
