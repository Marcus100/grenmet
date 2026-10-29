import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TrendsPage from "@/app/trends/page";

vi.mock("server-only", () => ({}));

describe("Election explainer", () => {
  it("assesses the evidence for votes, turnout and winners separately", () => {
    const { container } = render(<TrendsPage />);
    const voteChart = screen.getByRole("img", {
      name: "Share of the popular vote by party, 1951 to 2022",
    });
    const votePoint = [...voteChart.querySelectorAll("circle")].find((point) =>
      point.querySelector("title")?.textContent?.startsWith("1990, NDC:")
    );
    expect(votePoint).toHaveAttribute("fill", "var(--el-paper)");
    expect(votePoint?.textContent).toContain("mixed / secondary records");
    const winnerLink = screen.getByRole("link", { name: "Election 1990" });
    expect(winnerLink.querySelector("sup")).toBeNull();
    expect(
      container.querySelector("#records-title")?.parentElement?.textContent
    ).toContain("including 1990");
  });
  it("renders every chart with reading guidance and source caveats", () => {
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
