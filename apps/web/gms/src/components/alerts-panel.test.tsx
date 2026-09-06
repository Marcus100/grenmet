import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertsPanel } from "@/components/alerts-panel";
import type { AlertsResult } from "@/lib/cap";

const CANNOT_RETRIEVE = /cannot be retrieved right now/i;

const OK_EMPTY: AlertsResult = {
  activeCount: 0,
  groups: [
    { alerts: [], name: "Tropical Cyclone" },
    { alerts: [], name: "Marine / Small Craft" },
  ],
  status: "ok",
};

describe("AlertsPanel", () => {
  it("lists every hazard group with its count, even at zero", () => {
    render(<AlertsPanel result={OK_EMPTY} />);
    expect(screen.getByText("Tropical Cyclone")).toBeInTheDocument();
    expect(screen.getByText("Marine / Small Craft")).toBeInTheDocument();
    expect(screen.getByText("No active warnings")).toBeInTheDocument();
  });

  it("does not present an outage as an all-clear", () => {
    render(<AlertsPanel result={{ status: "unavailable" }} />);
    expect(screen.queryByText("No active warnings")).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(CANNOT_RETRIEVE)).toBeInTheDocument();
  });

  it("shows the active count when there are alerts", () => {
    render(
      <AlertsPanel
        result={{
          activeCount: 1,
          groups: [
            {
              alerts: [
                {
                  areas: [],
                  event: "Gale Warning",
                  expires: null,
                  headline: "Gale force winds",
                  identifier: "a",
                  severity: "Severe",
                  status: "Actual" as const,
                },
              ],
              name: "Wind",
            },
          ],
          status: "ok",
        }}
      />
    );
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "span" })).toBeInTheDocument();
  });
});
