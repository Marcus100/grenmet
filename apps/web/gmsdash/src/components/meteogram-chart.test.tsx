import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeteogramPanel } from "@/components/meteogram-chart";

const TEMPERATURE_LABEL = /Temperature \(degC\)/u;
const NO_VALUES = /no values for this parameter/u;
const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 18, 0);
const times = [0, 3, 6, 9, 12, 24, 27].map((h) => start + h * HOUR);

describe("MeteogramPanel", () => {
  it("renders a labelled SVG with a line and day markers", () => {
    const { container } = render(
      <MeteogramPanel
        series={[
          {
            kind: "line",
            label: "2 m temperature",
            tone: "primary",
            values: [27, 28, null, 29, 28.5, 27, 26],
          },
        ]}
        times={times}
        title="Temperature"
        unit="degC"
      />
    );
    expect(screen.getByRole("img", { name: TEMPERATURE_LABEL })).toBeTruthy();
    // The gap at index 2 lifts the pen: two sub-paths.
    const path = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(path.match(/M/gu)?.length).toBe(2);
    // 04:00 UTC is local midnight in Grenada: the 18th at 04:00 UTC is inside the range.
    expect(container.querySelectorAll("line[stroke-dasharray]").length).toBe(1);
  });

  it("draws one bar per value present", () => {
    const { container } = render(
      <MeteogramPanel
        series={[
          {
            kind: "bar",
            label: "Precipitation",
            tone: "primary",
            values: [null, 1.5, 0, 3, null, 0.2, 0],
          },
        ]}
        times={times}
        title="Precipitation"
        unit="mm per interval"
      />
    );
    expect(container.querySelectorAll("rect").length).toBe(5);
  });

  it("says so when the model has no values", () => {
    render(
      <MeteogramPanel
        series={[
          { kind: "line", label: "gust", tone: "muted", values: [null, null] },
        ]}
        times={times.slice(0, 2)}
        title="Wind gust"
        unit="m/s"
      />
    );
    expect(screen.getByText(NO_VALUES)).toBeTruthy();
  });
});
