import type { PublicObservation } from "@barrelsgd/api-client";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadingGrid } from "@/components/home/reading-grid";
import { Measure } from "@/components/measure";
import { currentConditions } from "@/lib/current-conditions";
import { nowReadings } from "@/lib/hero-readings";
import { DEFAULT_UNITS, formatMeasure } from "@/lib/units";

const observation = {
  station_id: "mbia",
  observed_at: "2026-10-28T12:00:00Z",
  status: "accepted",
  temperature_c: 31.5,
  wind_calm: false,
  wind_direction: "ESE",
  wind_speed_kt: 12,
  msl_pressure_hpa: 1012.5,
} as PublicObservation;

// The default is metric: the plain-text copy of a figure (search snippets,
// `textContent`, copied text) is the metric rendering, and the page also holds
// the imperial one, hidden by CSS. Both are in the HTML.
describe("a measure's text with the metric default", () => {
  it("renders the metric figure, with the imperial one beside it", () => {
    const { container } = render(
      <Measure measure={{ quantity: "temperature", low: 31.5 }} />
    );
    expect(
      container.querySelector('[data-units-only="metric"]')?.textContent
    ).toBe("31.5°C");
    expect(
      container.querySelector('[data-units-only="imperial"]')?.textContent
    ).toBe("89°F");
  });

  it("is the same text the reading carries for plain-text consumers", () => {
    const [pressure] = nowReadings(currentConditions(observation)).filter(
      (reading) => reading.measures?.[0]?.quantity === "pressure"
    );
    expect(pressure?.value).toBe(
      formatMeasure({ quantity: "pressure", low: 1012.5 }, DEFAULT_UNITS)
    );
    expect(pressure?.value).toBe("1012.5 hPa");
  });

  it("puts both renderings in the page text of a reading grid", () => {
    const readings = nowReadings(currentConditions(observation));
    const { container } = render(<ReadingGrid readings={readings} />);
    const textOf = (system: string) =>
      Array.from(
        container.querySelectorAll(`[data-units-only="${system}"]`),
        (node) => node.textContent
      ).join(" | ");
    expect(textOf("metric")).toContain("1012.5 hPa");
    expect(textOf("imperial")).toContain("inHg");
    expect(container.textContent).toContain("1012.5 hPa");
    expect(container.textContent).toContain("inHg");
  });
});
