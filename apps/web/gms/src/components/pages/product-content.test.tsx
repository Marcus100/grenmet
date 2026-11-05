import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const HINT = /leave 'from' empty/u;
const ENDS = /, (from|to)$/u;
const base = {
  kind: "climate-bulletin" as const,
  values: {
    issuedAt: "2026-10-15T10:00",
    forecaster: "Signed In",
  },
};

describe("ProductContentView for a Climate Bulletin", () => {
  it("shows each from/to range as one row", () => {
    render(
      <ProductContentView
        content={{
          ...base,
          values: {
            ...base.values,
            precipRangeMin: "340",
            precipRangeMax: "410",
            extremeSpellsMax: "3",
          },
        }}
      />
    );
    expect(screen.getByText("340 to 410")).toBeTruthy();
    expect(screen.getByText("up to 3")).toBeTruthy();
    expect(screen.queryByText(ENDS)).toBeNull();
  });

  it("shows the first-version text under Earlier format", () => {
    render(
      <ProductContentView
        content={{
          ...base,
          values: { ...base.values, summary: "An invented earlier summary." },
        }}
      />
    );
    expect(screen.getByText("Earlier format")).toBeTruthy();
    expect(screen.getByText("An invented earlier summary.")).toBeTruthy();
  });

  it("does not add Earlier format to a current-layout issue", () => {
    render(
      <ProductContentView
        content={{ ...base, values: { ...base.values, enso: "Invented." } }}
      />
    );
    expect(screen.queryByText("Earlier format")).toBeNull();
  });
});

describe("ProductContentView range rows", () => {
  const view = (values: Record<string, string>) =>
    render(
      <ProductContentView
        content={{ ...base, values: { ...base.values, ...values } }}
      />
    );

  it("does not show the editor hint in a range label", () => {
    view({ extremeSpellsMax: "3" });
    expect(
      screen.getByText("Historical number of extreme 3-day wet spells")
    ).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("reads an empty or zero minimum as 'up to' only where the hint says so", () => {
    view({
      extremeSpellsMin: "0",
      extremeSpellsMax: "3",
      wetDaysMin: "0",
      wetDaysMax: "5",
    });
    expect(screen.getByText("up to 3")).toBeTruthy();
    expect(screen.getByText("0 to 5")).toBeTruthy();
  });

  it("keeps a unit in a range label", () => {
    view({
      precipRangeMin: "120",
      precipRangeMax: "180",
      tempMaxRangeMin: "30.1",
      tempMaxRangeMax: "30.7",
    });
    expect(screen.getByText("Normal range for the season (mm)")).toBeTruthy();
    expect(screen.getByText("Normal maximum temperature (°C)")).toBeTruthy();
    expect(screen.getByText("120 to 180")).toBeTruthy();
  });
});
