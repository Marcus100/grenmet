import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastEditor } from "./forecast-editor";

describe("ForecastEditor", () => {
  it("renders the impact-based sections", () => {
    render(<ForecastEditor period="Morning" />);

    // Sections unique to the editor (Weather/Winds/etc. also appear in the
    // live preview, so assert the ones that don't overlap).
    for (const section of [
      "Issue details",
      "IBF hazard icons",
      "Risk matrix",
    ]) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.getByText("Overall likelihood")).toBeInTheDocument();
    expect(screen.getByText("Forecaster on duty")).toBeInTheDocument();
  });

  it("renders the live impact-based product preview", () => {
    render(<ForecastEditor period="Morning" />);

    // DocumentPreview mounts the product for both screen and print, so the
    // text appears more than once — assert at least one instance rendered.
    expect(
      screen.getAllByText("GRENADA METEOROLOGICAL SERVICE").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Impact outlook").length).toBeGreaterThan(0);
  });
});
