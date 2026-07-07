import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImpactForecasts } from "./impact-forecasts";

// The heavy TanStack-form editor is exercised in its own suite; here we only
// verify the period tabs consolidate the three forecasts onto one page.
vi.mock("./forecast-editor", () => ({
  ForecastEditor: ({ period }: { period: string }) => (
    <div>Editor for {period}</div>
  ),
}));

describe("ImpactForecasts", () => {
  it("offers a tab per forecast period, defaulting to Morning", () => {
    render(<ImpactForecasts />);

    expect(
      screen.getByRole("heading", { name: "Impact Based Forecasts" })
    ).toBeInTheDocument();
    for (const period of ["Morning", "Midday", "Evening"]) {
      expect(screen.getByRole("tab", { name: period })).toBeInTheDocument();
    }
    expect(screen.getByText("Editor for Morning")).toBeInTheDocument();
  });

  it("switches the editor when another period tab is selected", () => {
    render(<ImpactForecasts />);

    fireEvent.click(screen.getByRole("tab", { name: "Evening" }));
    expect(screen.getByText("Editor for Evening")).toBeInTheDocument();
  });
});
