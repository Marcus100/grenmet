import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WarningStatusPill } from "@/components/warning-status-pill";
import type { AlertsResult } from "@/lib/cap";

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
