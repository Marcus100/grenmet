import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/footer";

describe("Footer", () => {
  it("includes the current year in the copyright line", () => {
    render(<Footer />);
    const year = new Date().getFullYear().toString();
    expect(
      screen.getAllByText((_, el) => (el?.textContent ?? "").includes(year))
        .length
    ).toBeGreaterThan(0);
  });

  it("links every footer item at least once", () => {
    render(<Footer />);
    expect(screen.getAllByText("About GMS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("News and media").length).toBeGreaterThan(0);
  });
});
