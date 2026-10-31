import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WarningStatusPill } from "@/components/warning-status-pill";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

const ONE_ACTIVE = /· 1 active$/;

const ACTIVE: AlertsResult = {
  activeCount: 1,
  groups: [
    {
      alerts: [
        {
          areas: [],
          event: "Flood Watch",
          expires: null,
          headline: "Flooding possible",
          identifier: "a",
          severity: "Moderate",
          status: "Actual",
        },
      ],
      name: "Flood",
    },
  ],
  status: "ok",
};

it.each([
  [
    "no active alerts",
    { activeCount: 0, groups: [], status: "ok" },
    "No active alerts",
  ],
  ["an unreachable feed", { status: "unavailable" }, "Alerts unavailable"],
  ["active alerts", ACTIVE, ONE_ACTIVE],
] as const)(
  "shows only icon and colour for %s; screen readers still hear it",
  (_name, alerts, words) => {
    render(<WarningStatusPill alerts={alerts as AlertsResult} />);
    expect(screen.getByRole("link", { name: words })).toHaveAttribute(
      "href",
      "/alerts"
    );
    expect(screen.getByText(words)).toHaveClass("sr-only");
  }
);

const NO_WARNINGS: AlertsResult = { activeCount: 0, groups: [], status: "ok" };
const COUNT_1: GreenStatus = {
  status: "ok",
  count: 1,
  other: 0,
  complete: true,
};
const COUNT_3: GreenStatus = {
  status: "ok",
  count: 3,
  other: 0,
  complete: true,
};
const UNREADABLE: GreenStatus = { status: "unavailable" };
const INCOMPLETE: GreenStatus = {
  status: "ok",
  count: 0,
  other: 0,
  complete: false,
};
const OTHER: GreenStatus = { status: "ok", count: 0, other: 1, complete: true };

it.each([
  ["one Green alert in effect", COUNT_1, "Green alert in effect"],
  ["several Green alerts in effect", COUNT_3, "3 Green alerts in effect"],
  ["Green alerts that cannot be read", UNREADABLE, "Green alerts unavailable"],
  [
    "an incomplete outlook with nothing listed",
    INCOMPLETE,
    "Alert information may be incomplete",
  ],
  ["a GMS item that is not yet a warning", OTHER, "GMS alert in effect"],
] as const)(
  "says %s on the masthead, linking to /alerts, and never 'No active alerts'",
  (_name, green, words) => {
    render(<WarningStatusPill alerts={NO_WARNINGS} green={green} />);
    expect(screen.getByRole("link", { name: words })).toHaveAttribute(
      "href",
      "/alerts"
    );
    expect(screen.queryByText("No active alerts")).not.toBeInTheDocument();
  }
);

it("is grey, not green, when Green alerts cannot be read", () => {
  render(<WarningStatusPill alerts={NO_WARNINGS} green={UNREADABLE} />);
  const pill = screen.getByRole("link", { name: "Green alerts unavailable" });
  expect(pill).toHaveClass(WARNING_LEVEL_SURFACE.unknown.split(" ")[0] ?? "");
  expect(pill).not.toHaveClass(WARNING_LEVEL_SURFACE.none.split(" ")[0] ?? "");
});

it("shows the warning at once, whatever the outlook says", () => {
  render(<WarningStatusPill alerts={ACTIVE} green={UNREADABLE} />);
  expect(screen.getByRole("link", { name: ONE_ACTIVE })).toBeInTheDocument();
});
