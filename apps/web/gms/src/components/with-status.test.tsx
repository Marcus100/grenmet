import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarningStatusPill } from "@/components/warning-status-pill";
import { WithStatus } from "@/components/with-alerts";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";

/** An outlook that never answers. */
const NEVER = new Promise<GreenStatus>(() => undefined);
const CHECKING = "Checking";
const WARNING: AlertsResult = {
  status: "ok",
  activeCount: 1,
  groups: [
    {
      name: "Flood",
      alerts: [
        {
          identifier: "a",
          event: "Flood Watch",
          headline: "Flooding possible",
          severity: "Severe",
          status: "Actual",
          areas: [],
          expires: null,
        },
      ],
    },
  ],
};
const NONE: AlertsResult = { status: "ok", activeCount: 0, groups: [] };

/** Renders the masthead pair and lets the promises settle. */
async function renderStatus(
  alerts: Promise<AlertsResult>,
  green: Promise<GreenStatus>
) {
  await act(() => {
    render(
      <WithStatus alerts={alerts} fallback={<p>{CHECKING}</p>} green={green}>
        {(cap, outlook) => <WarningStatusPill alerts={cap} green={outlook} />}
      </WithStatus>
    );
  });
}

describe("WithStatus: a slow GMS outlook never delays a warning", () => {
  it("shows the warning label at once, while the outlook never answers", async () => {
    await renderStatus(Promise.resolve(WARNING), NEVER);
    expect(
      await screen.findByRole("link", { name: "Take action now · 1 active" })
    ).toBeInTheDocument();
    expect(screen.queryByText(CHECKING)).not.toBeInTheDocument();
  });

  it("keeps checking, and never says no alerts, while the outlook is still being read", async () => {
    await renderStatus(Promise.resolve(NONE), NEVER);
    expect(screen.getByText(CHECKING)).toBeInTheDocument();
    expect(screen.queryByText("No active alerts")).not.toBeInTheDocument();
  });

  it("names the Green alerts once the outlook answers", async () => {
    await renderStatus(
      Promise.resolve(NONE),
      Promise.resolve({ status: "ok", count: 1, other: 0, complete: true })
    );
    expect(
      await screen.findByRole("link", { name: "Green alert in effect" })
    ).toBeInTheDocument();
  });
});
