import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
