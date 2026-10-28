import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CODES } from "@/data/model";
import type { GeoFile, Ring } from "@/data/types";
import { LevelMap } from "./level-map";

const rings: Ring[] = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ],
];
const constituencies = Object.fromEntries(
  CODES.map((code) => [code, { rings, label: [0, 0] }])
) as GeoFile["constituencies"];
const geo: GeoFile = {
  constituencies,
  divisions: {
    A01: { cons: "A", located: true, rings, label: [0, 0], villages: [] },
    A02: { cons: "A", located: false, rings, label: [0, 0], villages: [] },
    A04: { cons: "B", located: true, rings, label: [0, 0], villages: [] },
  },
  inset: { x0: 0, x1: 1, y0: 0, y1: 1 },
  land: rings,
};
const constituencyRegions = [
  { code: "A", fill: "red", title: "Constituency value: 70" },
];
const divisionRegions = [
  { code: "A01", fill: "blue", title: "Division value: 20" },
  { code: "A02", fill: "green", title: "Unlocated division" },
  { code: "A03", fill: "green", title: "Missing division" },
  { code: "A04", fill: "green", title: "Wrong constituency geometry" },
];

afterEach(cleanup);

describe("Map geographic level", () => {
  it("defaults to constituencies and switches to the division's own measure", () => {
    render(
      <LevelMap
        constituencyRegions={constituencyRegions}
        divisionRegions={divisionRegions}
        geo={geo}
        label="Test measure"
      />
    );
    expect(
      screen.getByRole("button", { name: "Constituencies" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Constituency value: 70").closest("path")
    ).toHaveAttribute("fill", "red");
    fireEvent.click(screen.getByRole("button", { name: "Polling divisions" }));
    expect(
      screen.getByRole("img", { name: "Test measure — polling divisions" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Constituency value: 70")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Division value: 20").closest("path")
    ).toHaveAttribute("fill", "blue");
    expect(screen.queryByText("Unlocated division")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing division")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Wrong constituency geometry")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A02, A03, A04");
  });

  it("disables divisions and explains fallback when the measure has no division data", () => {
    render(
      <LevelMap
        constituencyRegions={constituencyRegions}
        defaultLevel="div"
        geo={geo}
        label="MPs"
        unavailableReason="MPs represent constituencies."
      />
    );
    expect(
      screen.getByRole("button", { name: "Polling divisions" })
    ).toBeDisabled();
    expect(
      screen.getByText("MPs represent constituencies. Showing constituencies.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "MPs — constituencies" })
    ).toBeInTheDocument();
  });

  it("falls back when all division geometry is unlocated or missing", () => {
    render(
      <LevelMap
        constituencyRegions={constituencyRegions}
        defaultLevel="div"
        divisionRegions={divisionRegions.slice(1)}
        geo={geo}
        label="Test"
      />
    );
    expect(
      screen.getByRole("button", { name: "Polling divisions" })
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Polling-division boundaries are unavailable for these records. Showing constituencies."
      )
    ).toBeInTheDocument();
  });

  it("falls back when division data disappears without carrying its old values into the new map", () => {
    const { rerender } = render(
      <LevelMap
        constituencyRegions={constituencyRegions}
        divisionRegions={divisionRegions}
        geo={geo}
        label="Year one"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Polling divisions" }));
    rerender(
      <LevelMap
        constituencyRegions={constituencyRegions}
        geo={geo}
        label="Year two"
      />
    );
    expect(
      screen.getByRole("img", { name: "Year two — constituencies" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Constituencies" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Division value: 20")).not.toBeInTheDocument();
  });
});
