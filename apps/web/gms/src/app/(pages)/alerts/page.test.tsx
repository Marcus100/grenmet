import type { SectorOutlook, SectorOutlookItem } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchActiveAlerts, fetchPastAlerts } from "@/lib/cap";
import type { AlertsResult } from "@/lib/cap-alerts";
import { fetchSectorOutlook } from "@/lib/products";
import WarningsPage from "./page";

vi.mock("@/lib/cap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cap")>();
  return {
    ...actual,
    fetchActiveAlerts: vi.fn(),
    fetchPastAlerts: vi.fn(),
  };
});
vi.mock("@/lib/products", () => ({ fetchSectorOutlook: vi.fn() }));

const NO_WARNINGS: AlertsResult = { status: "ok", activeCount: 0, groups: [] };
const NO_GREEN_IN_EFFECT = /No Green alerts are in effect/;
const WARNINGS_UNAVAILABLE =
  /Warning information cannot be retrieved right now/;
const NONE_LABEL =
  "There are no alerts in effect for Grenada, Carriacou or Petite Martinique.";

const greenItem: SectorOutlookItem = {
  source: "Bulletin",
  title: "Calm seas and light winds",
  product: "Marine",
  colour: "green",
  impacts: "Routine conditions for boating.",
  response: "",
  valid_from: "2026-10-29T12:00:00Z",
  valid_to: "2026-11-02T12:00:00Z",
  reference: "ref-green",
  identifier: null,
  product_id: null,
  sectors: [],
  affects_everyone: true,
};

function outlook(items: SectorOutlookItem[], complete = true): SectorOutlook {
  return {
    as_of: "2026-10-30T14:00:00Z",
    window_start: "2026-10-30T04:00:00Z",
    window_end: "2026-11-06T04:00:00Z",
    complete,
    items,
  };
}

/** The status band is the first live region on the page; the legend repeats level words. */
const band = () => screen.getAllByRole("status")[0] as HTMLElement;

async function renderPage(alerts: AlertsResult, feed: SectorOutlook | null) {
  vi.mocked(fetchActiveAlerts).mockResolvedValue(alerts);
  vi.mocked(fetchPastAlerts).mockResolvedValue([]);
  vi.mocked(fetchSectorOutlook).mockResolvedValue(feed);
  render(await WarningsPage());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Alerts in effect: Green alerts", () => {
  it("lists a Green alert in effect and does not say there are no alerts", async () => {
    await renderPage(NO_WARNINGS, outlook([greenItem]));
    expect(screen.getByText("Calm seas and light winds")).toBeInTheDocument();
    expect(band()).toHaveTextContent("Green level · 1 active");
    expect(screen.queryByText(NONE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_GREEN_IN_EFFECT)).not.toBeInTheDocument();
  });

  it("says no alerts only when there are no warnings and no Green alerts", async () => {
    await renderPage(NO_WARNINGS, outlook([]));
    expect(screen.getByText(NONE_LABEL)).toBeInTheDocument();
    expect(
      screen.getByText("No Green alerts are in effect.")
    ).toBeInTheDocument();
    expect(band()).toHaveTextContent("No active alerts");
  });

  it("says Green alerts could not be checked, never that there are none, when the outlook fails", async () => {
    await renderPage(NO_WARNINGS, null);
    expect(
      screen.getByText(
        "Green alerts cannot be retrieved right now. This is not an all-clear for Green level alerts."
      )
    ).toBeInTheDocument();
    expect(band()).not.toHaveTextContent("No active alerts");
    expect(screen.queryByText(NONE_LABEL)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No warnings or watches are in effect. Green alerts could not be checked right now."
      )
    ).toBeInTheDocument();
  });

  it("keeps the warnings feed's own unavailable notice when the CAP feed fails", async () => {
    await renderPage({ status: "unavailable" }, outlook([greenItem]));
    expect(screen.getByText(WARNINGS_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText("Calm seas and light winds")).toBeInTheDocument();
    expect(band()).toHaveTextContent("Alerts unavailable");
  });
});
