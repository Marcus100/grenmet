import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertGroups } from "@/components/pages/alert-groups";
import { WarningLegend } from "@/components/pages/warning-legend";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import type { AlertsResult, PublicAlert } from "@/lib/cap";

const NOT_ALL_CLEAR = /not an all-clear/i;
const NOT_RETRIEVED = /cannot be retrieved right now/i;
const FEED_DOWN = /CAP feed not responding/;
const NONE_IN_EFFECT = /^There are no warnings in effect/;

const CHECKED_AT = new Date("2026-09-28T20:40:00Z");

function result(alerts: PublicAlert[]): AlertsResult {
  return {
    activeCount: alerts.length,
    groups: [{ alerts, name: "Wind" }],
    status: "ok",
  };
}

const GALE: PublicAlert = {
  areas: ["Grenada", "Carriacou"],
  event: "Gale Warning",
  expires: null,
  headline: "Gale force winds this evening",
  identifier: "gale-1",
  severity: "Severe",
  status: "Actual",
};

describe("AlertGroups", () => {
  it("states each warning's level in words, matching the header pill", () => {
    render(<AlertGroups result={result([GALE])} />);
    // Severe is take-action everywhere (severityLevel), never amber here.
    expect(screen.getByText("Take action now")).toBeInTheDocument();
    expect(screen.getByText("Grenada, Carriacou")).toBeInTheDocument();
    expect(screen.getByText("Until further notice")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/warnings/gale-1"
    );
  });

  it("says plainly when nothing is in effect", () => {
    render(<AlertGroups result={result([])} />);
    expect(screen.getByText(NONE_IN_EFFECT)).toBeInTheDocument();
  });

  it("never shows an outage as an empty list", () => {
    render(<AlertGroups result={{ status: "unavailable" }} />);
    expect(screen.getByText(NOT_RETRIEVED)).toBeInTheDocument();
    expect(screen.queryByText(NONE_IN_EFFECT)).not.toBeInTheDocument();
  });
});

describe("WarningStatusBand", () => {
  it("repeats the pill wording and the level guidance", () => {
    render(
      <WarningStatusBand alerts={result([GALE])} checkedAt={CHECKED_AT} />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Take action now · 1 active"
    );
    expect(
      screen.getByText("Last checked 16:40 AST · CAP feed OK", {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  it("marks a feed outage as not an all-clear", () => {
    render(
      <WarningStatusBand
        alerts={{ status: "unavailable" }}
        checkedAt={CHECKED_AT}
      />
    );
    expect(screen.getByText("Warnings unavailable")).toBeInTheDocument();
    expect(screen.getByText(NOT_ALL_CLEAR)).toBeInTheDocument();
    expect(screen.getByText(FEED_DOWN)).toBeInTheDocument();
  });
});

describe("WarningLegend", () => {
  it("names all five levels", () => {
    render(<WarningLegend />);
    for (const label of [
      "No active warnings",
      "Be aware",
      "Be prepared",
      "Take action now",
      "Status unavailable",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
