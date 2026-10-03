import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GuidePage, { generateStaticParams } from "@/app/learn/[slug]/page";
import { GUIDES } from "@/data/learning";

vi.mock("server-only", () => ({}));
describe("learning pages", () => {
  it("pre-renders all eight real guides", () => {
    expect(generateStaticParams().map((entry) => entry.slug)).toEqual(
      GUIDES.map((guide) => guide.slug)
    );
  });
  it("connects the counting lesson to the working experiment and source details", async () => {
    render(
      await GuidePage({
        params: Promise.resolve({ slug: "counting-and-results" }),
      })
    );
    expect(
      screen.getByRole("heading", {
        name: "What exactly does an election number count?",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset example" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Official record · General Election Report 2022")
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Try explaining it yourself" })
    ).toBeInTheDocument();
  });
});
