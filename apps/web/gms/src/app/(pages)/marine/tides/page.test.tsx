import type { TidesResponse } from "@barrelsgd/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/lib/env", () => ({
  env: { AUTH_API_URL: "http://api.example.test", AUTH_API_V1_STR: "/api/v1" },
}));
vi.mock("@/lib/almanac", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/almanac")>()),
  fetchPublicTides: mocks.fetch,
}));

import TidesPage from "./page";

const NOV_9 = /9 Nov/u;
const NOV_12 = /12 Nov/u;

const NOTE =
  "Predicted tides for Prickly Bay. Provisional, not for navigation.";

function tides(events: TidesResponse["events"]): TidesResponse {
  return { station: "pric", name: "Prickly Bay", events };
}

const TWO_DAYS = tides([
  {
    event_type: "LOW",
    time_utc: "2026-11-09T07:12:00Z",
    time_local: "2026-11-09T03:12:00-04:00",
    height_m_mllw: 0.2,
    timing_quality: "predicted",
  },
  {
    event_type: "HIGH",
    time_utc: "2026-11-09T13:26:00Z",
    time_local: "2026-11-09T09:26:00-04:00",
    height_m_mllw: 1.2,
    timing_quality: "predicted",
  },
  {
    event_type: "HIGH",
    time_utc: "2026-11-12T13:02:00Z",
    time_local: "2026-11-12T09:02:00-04:00",
    height_m_mllw: 1.1,
    timing_quality: "predicted",
  },
]);

async function renderPage() {
  render(await TidesPage());
}

beforeEach(() => {
  // Grenada is UTC-4 all year: 12:00 UTC on 9 Nov is 08:00 on the same day.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.fetch.mockClear();
});

describe("marine tides page", () => {
  it("states the provisional note and lists each day's tides with heights", async () => {
    mocks.fetch.mockResolvedValue({ status: "ok", tides: TWO_DAYS });

    await renderPage();

    expect(screen.getByRole("note").textContent).toBe(NOTE);
    // Seven days from today, in Grenada time.
    expect(mocks.fetch).toHaveBeenCalledWith("2026-11-09", "2026-11-15");
    const nine = screen.getByRole("heading", { name: NOV_9 });
    const table = nine.nextElementSibling;
    if (!table) throw new Error("no table under the 9 Nov heading");
    const rows = within(table as HTMLElement).getAllByRole("row");
    expect(rows[1]?.textContent).toContain("Low");
    expect(rows[1]?.textContent).toContain("03:12");
    expect(rows[2]?.textContent).toContain("High");
    expect(rows[2]?.textContent).toContain("09:26");
    // Heights are metres, with feet in the imperial rendering.
    expect(screen.getByText("1.2 m")).toBeTruthy();
    expect(screen.getByText("0.2 m")).toBeTruthy();
    expect(screen.getByText("3.9 ft")).toBeTruthy();
    expect(screen.getByRole("heading", { name: NOV_12 })).toBeTruthy();
    expect(
      screen.queryByText("No predictions available for these dates.")
    ).toBeNull();
  });

  it("keeps the section and says there are no predictions when the window is empty", async () => {
    mocks.fetch.mockResolvedValue({ status: "ok", tides: tides([]) });

    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Next seven days" })
    ).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(NOTE);
    expect(
      screen.getByText("No predictions available for these dates.")
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says the predictions cannot be retrieved, never that there are none", async () => {
    mocks.fetch.mockResolvedValue({ status: "unavailable" });

    await renderPage();

    expect(screen.getByRole("note").textContent).toBe(NOTE);
    expect(screen.getByRole("status").textContent).toBe(
      "Tide predictions cannot be retrieved right now. Check again later."
    );
    expect(
      screen.queryByText("No predictions available for these dates.")
    ).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
