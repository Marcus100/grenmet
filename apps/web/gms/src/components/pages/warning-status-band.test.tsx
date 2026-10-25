import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import type { AlertsResult } from "@/lib/cap-alerts";

const CHECKED = new Date("2026-10-23T12:00:00Z");
const NOT_ALL_CLEAR = /This is not an all-clear/;
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
