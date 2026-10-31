// @vitest-environment node
import type { SectorOutlook, SectorOutlookItem } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchActiveAlerts } from "@/lib/cap";
import type { AlertsResult } from "@/lib/cap-alerts";
import { greenAlerts } from "@/lib/green-alerts";
import { fetchGreenAlerts, fetchGreenStatus } from "@/lib/green-status";
import { fetchSectorOutlook } from "@/lib/products";
import { reportError } from "@/lib/report-error";

vi.mock("@/lib/cap", () => ({ fetchActiveAlerts: vi.fn() }));
vi.mock("@/lib/products", () => ({ fetchSectorOutlook: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/green-alerts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/green-alerts")>();
  return { ...actual, greenAlerts: vi.fn(actual.greenAlerts) };
});

const NO_WARNINGS: AlertsResult = { status: "ok", activeCount: 0, groups: [] };

function item(overrides: Partial<SectorOutlookItem> = {}): SectorOutlookItem {
  return {
    source: "Bulletin",
    title: "Calm seas",
    product: "Marine",
    colour: "green",
    impacts: "Routine conditions.",
    response: "",
    valid_from: "2026-10-29T12:00:00Z",
    valid_to: "2026-12-31T12:00:00Z",
    reference: "ref",
    identifier: null,
    product_id: null,
    sectors: [],
    affects_everyone: true,
    ...overrides,
  };
}

function outlook(items: SectorOutlookItem[], complete = true): SectorOutlook {
  return {
    as_of: "2026-10-30T14:00:00Z",
    window_start: "2026-10-30T04:00:00Z",
    window_end: "2026-11-06T04:00:00Z",
    complete,
    items,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchActiveAlerts).mockResolvedValue(NO_WARNINGS);
});

describe("fetchGreenStatus", () => {
  it("counts Green alerts in effect", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([item()]));
    expect(await fetchGreenStatus()).toEqual({
      status: "ok",
      count: 1,
      other: 0,
      complete: true,
    });
  });

  it("is unavailable when the outlook did not load", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(null);
    expect(await fetchGreenStatus()).toEqual({ status: "unavailable" });
  });

  it("carries an incomplete read through, so it is never an all-clear", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([], false));
    expect(await fetchGreenStatus()).toEqual({
      status: "ok",
      count: 0,
      other: 0,
      complete: false,
    });
  });

  it("does not count an All clear in effect as a Green or other alert", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(
      outlook([item({ notice_type: "All clear", title: "Calm seas" })])
    );
    expect(await fetchGreenStatus()).toEqual({
      status: "ok",
      count: 0,
      other: 0,
      complete: true,
    });
  });

  it("counts a non-Green item with no CAP warning as other, not ignored", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(
      outlook([item({ colour: "yellow", identifier: null, title: "Gale" })])
    );
    expect(await fetchGreenStatus()).toMatchObject({ count: 0, other: 1 });
  });

  it("never rejects: an outlook that cannot be interpreted is unavailable and reported", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([item()]));
    vi.mocked(greenAlerts).mockImplementationOnce(() => {
      throw new RangeError("Invalid time value");
    });
    await expect(fetchGreenStatus()).resolves.toEqual({
      status: "unavailable",
    });
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "green-alerts");
  });
});

describe("fetchGreenAlerts", () => {
  it("returns the listed items for the alerts page", async () => {
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([item()]));
    const result = await fetchGreenAlerts();
    expect(result).toMatchObject({
      status: "ok",
      items: [{ title: "Calm seas" }],
    });
  });
});
