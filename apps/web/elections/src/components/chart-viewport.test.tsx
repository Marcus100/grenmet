import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartViewport } from "@/components/chart-viewport";

describe("readable chart viewport", () => {
  it("keeps the plot named and keyboard reachable without swallowing its controls", () => {
    const choose = vi.fn();
    render(
      <ChartViewport>
        <svg aria-label="Turnout by election" role="img" viewBox="0 0 560 200">
          <text x={20} y={20}>
            Turnout
          </text>
        </svg>
        <button onClick={choose} type="button">
          Choose election
        </button>
      </ChartViewport>
    );
    const viewport = screen.getByRole("region", { name: "Scrollable chart" });
    viewport.focus();
    expect(viewport).toHaveFocus();
    expect(
      screen.getByRole("img", { name: "Turnout by election" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose election" }));
    expect(choose).toHaveBeenCalledOnce();
  });
});
