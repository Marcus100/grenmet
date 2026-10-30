import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";

const INCOMPLETE_LIST = /this list may be incomplete/;
const CHECKED = new Date("2026-10-23T12:00:00Z");
const NOT_ALL_CLEAR = /This is not an all-clear/;
const GREEN_OK = /Green alerts OK/;
const GREEN_NOT_RESPONDING = /Green alerts not responding/;
const ALL_CLEAR: AlertsResult = { status: "ok", groups: [], activeCount: 0 };
const UNAVAILABLE: AlertsResult = { status: "unavailable" };

describe("WarningStatusBand icon", () => {
  it("uses a shield check only for the all-clear", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={NO_GREEN}
      />
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

const ONE_GREEN: GreenStatus = {
  status: "ok",
  count: 1,
  other: 0,
  complete: true,
};
const NO_GREEN: GreenStatus = {
  status: "ok",
  count: 0,
  other: 0,
  complete: true,
};
const GREEN_UNAVAILABLE: GreenStatus = { status: "unavailable" };
const INCOMPLETE_EMPTY: GreenStatus = {
  status: "ok",
  count: 0,
  other: 0,
  complete: false,
};
const INCOMPLETE_ONE: GreenStatus = {
  status: "ok",
  count: 1,
  other: 0,
  complete: false,
};
const OTHER_ITEM: GreenStatus = {
  status: "ok",
  count: 0,
  other: 2,
  complete: true,
};
const INCOMPLETE_HEADLINE = "Alert information may be incomplete";

describe("WarningStatusBand without the outlook's answer", () => {
  it("is never an all-clear when nothing says the outlook was read", () => {
    const { container } = render(
      <WarningStatusBand alerts={ALL_CLEAR} checkedAt={CHECKED} />
    );
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
  });
});

describe("WarningStatusBand with the GMS outlook", () => {
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

  it("says no alerts only when the outlook is read in full and nothing is in effect", () => {
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

  it("is never an all-clear for an incomplete read with nothing listed", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={INCOMPLETE_EMPTY}
      />
    );
    expect(screen.getByText(INCOMPLETE_HEADLINE)).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
    expect(screen.getByText(NOT_ALL_CLEAR)).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
  });

  it("names Green alerts in effect, and says the list may be incomplete", () => {
    render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={INCOMPLETE_ONE}
      />
    );
    expect(screen.getByText("Green level · 1 active")).toBeInTheDocument();
    expect(screen.getByText(INCOMPLETE_LIST)).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
  });

  it("names GMS items that are not yet warnings, and is never an all-clear", () => {
    const { container } = render(
      <WarningStatusBand
        alerts={ALL_CLEAR}
        checkedAt={CHECKED}
        green={OTHER_ITEM}
      />
    );
    expect(screen.getByText("2 GMS alerts in effect")).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
  });
});
