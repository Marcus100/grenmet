import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PAPER_HEIGHT, PAPER_WIDTH, Paper } from "./paper";

describe("Paper", () => {
  it("renders children inside a print-paper surface", () => {
    render(
      <Paper>
        <span>Doc body</span>
      </Paper>
    );
    expect(screen.getByText("Doc body")).toBeInTheDocument();
  });

  it("marks the page for print and fixes US Letter dimensions", () => {
    const { container } = render(<Paper>x</Paper>);
    const page = container.querySelector("[data-print-paper]");

    expect(page).not.toBeNull();
    expect(page).toHaveStyle({
      width: `${PAPER_WIDTH}px`,
      height: `${PAPER_HEIGHT}px`,
    });
  });

  it("merges a custom className with the base surface classes", () => {
    const { container } = render(<Paper className="px-12">x</Paper>);
    const page = container.querySelector("[data-print-paper]");

    expect(page).toHaveClass("px-12", "bg-white");
  });
});
