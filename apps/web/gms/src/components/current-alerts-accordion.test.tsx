import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import type { AlertsResult } from "@/lib/cap";

const UNAVAILABLE_MESSAGE = /cannot be retrieved right now/i;

const OK_EMPTY: AlertsResult = {
  activeCount: 0,
  groups: [
    { alerts: [], name: "Tropical Cyclone" },
    { alerts: [], name: "Marine / Small Craft" },
  ],
  status: "ok",
};

describe("CurrentAlertsAccordion", () => {
  it("says there are no active warnings when the service returned none", () => {
    render(<CurrentAlertsAccordion result={OK_EMPTY} />);
    expect(screen.getByText("No active warnings")).toBeInTheDocument();
  });

  it("summarises how many warnings are active", () => {
    render(
      <CurrentAlertsAccordion
        result={{
          activeCount: 2,
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
                },
              ],
              name: "Wind",
            },
          ],
          status: "ok",
        }}
      />
    );
    expect(screen.getByText("2 active")).toBeInTheDocument();
  });

  it("does not present an outage as an all-clear", async () => {
    render(<CurrentAlertsAccordion result={{ status: "unavailable" }} />);
    expect(screen.queryByText("No active warnings")).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Current alerts"));
    expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });

  it("keeps every hazard name visible so the panel shape is stable", async () => {
    render(<CurrentAlertsAccordion result={OK_EMPTY} />);
    await userEvent.click(screen.getByText("Current alerts"));
    expect(screen.getByText("Tropical Cyclone")).toBeInTheDocument();
    expect(screen.getByText("Marine / Small Craft")).toBeInTheDocument();
  });
});
