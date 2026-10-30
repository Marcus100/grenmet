import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import type { AlertsResult } from "@/lib/cap-alerts";
import type { GreenAlerts } from "@/lib/green-alerts";

const CHECKED = new Date("2026-10-23T12:00:00Z");
const NOT_ALL_CLEAR = /This is not an all-clear/;
const GREEN_OK = /Green alerts OK/;
const GREEN_NOT_RESPONDING = /Green alerts not responding/;
const ALL_CLEAR: AlertsResult = { status: "ok", groups: [], activeCount: 0 };
const UNAVAILABLE: AlertsResult = { status: "unavailable" };

describe("WarningStatusBand icon", () => {
  it("uses a shield check only for the all-clear", () => {
    const { container } = render(
      <WarningStatusBand alerts={ALL_CLEAR} checkedAt={CHECKED} />
    );
    expect(screen.getAllByText("No active alerts").length).toBeGreaterThan(0);
    expect(container.querySelector(".lucide-shield-check")).not.toBeNull();
    expect(container.querySelector(".lucide-triangle-alert")).toBeNull();
  });

  it("keeps the warning triangle when the feed is unavailable", () => {
    const { container } = render(
      <WarningStatusBand alerts={UNAVAILABLE} checkedAt={CHECKED} />
    );
    expect(container.querySelector(".lucide-triangle-alert")).not.toBeNull();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
    expect(screen.getByText(NOT_ALL_CLEAR)).toBeInTheDocument();
  });
});

const ONE_GREEN: GreenAlerts = {
  status: "ok",
  complete: true,
  items: [
    {
      id: "a",
      title: "Marine",
      summary: "",
      when: "In effect",
      href: null,
    },
  ],
};
const NO_GREEN: GreenAlerts = { status: "ok", complete: true, items: [] };
const GREEN_UNAVAILABLE: GreenAlerts = { status: "unavailable" };

describe("WarningStatusBand with Green alerts", () => {
  it("names Green alerts in effect and never says no alerts", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={ONE_GREEN}
      />
    );
    expect(screen.getByText("Green level · 1 active")).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
    expect(screen.getByText(GREEN_OK)).toBeInTheDocument();
  });

  it("says no alerts only when there are no Green alerts either", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={NO_GREEN}
      />
    );
    expect(container.querySelector(".lucide-shield-check")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("No active alerts");
  });

  it("is never an all-clear when the Green feed is unreadable", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={GREEN_UNAVAILABLE}
      />
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
    expect(screen.getByText("No warnings or watches")).toBeInTheDocument();
    expect(screen.getByText(NOT_ALL_CLEAR)).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
    expect(screen.getByText(GREEN_NOT_RESPONDING)).toBeInTheDocument();
  });
});
