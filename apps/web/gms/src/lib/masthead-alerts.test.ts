// @vitest-environment node
import type { SectorOutlook, SectorOutlookItem } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchActiveAlerts } from "@/lib/cap";
import type { AlertsResult } from "@/lib/cap-alerts";
import { fetchMastheadAlerts } from "@/lib/masthead-alerts";
import { fetchSectorOutlook } from "@/lib/products";

vi.mock("@/lib/cap", () => ({ fetchActiveAlerts: vi.fn() }));
vi.mock("@/lib/products", () => ({ fetchSectorOutlook: vi.fn() }));

const NO_WARNINGS: AlertsResult = { status: "ok", activeCount: 0, groups: [] };

const green = (
  overrides: Partial<SectorOutlookItem> = {}
): SectorOutlookItem => ({
  source: "Bulletin",
  title: "Calm seas",
  product: "Marine",
  colour: "green",
  impacts: "Routine conditions.",
  response: "",
  valid_from: "2026-10-29T12:00:00Z",
  valid_to: "2026-12-31T12:00:00Z",
  reference: "ref-green",
  identifier: null,
  product_id: null,
  sectors: [],
  affects_everyone: true,
  ...overrides,
});

function outlook(items: SectorOutlookItem[]): SectorOutlook {
  return {
    as_of: "2026-10-30T14:00:00Z",
    window_start: "2026-10-30T04:00:00Z",
    window_end: "2026-11-06T04:00:00Z",
    complete: true,
    items,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchMastheadAlerts", () => {
  it("counts the Green alerts in effect alongside the CAP warnings", async () => {
    vi.mocked(fetchActiveAlerts).mockResolvedValue(NO_WARNINGS);
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([green()]));
    expect(await fetchMastheadAlerts()).toMatchObject({
      status: "ok",
      activeCount: 0,
      green: { status: "ok", count: 1 },
    });
  });

  it("says Green alerts are unavailable when the outlook did not load", async () => {
    vi.mocked(fetchActiveAlerts).mockResolvedValue(NO_WARNINGS);
    vi.mocked(fetchSectorOutlook).mockResolvedValue(null);
    expect(await fetchMastheadAlerts()).toMatchObject({
      green: { status: "unavailable" },
    });
  });

  it("counts a Green item once, when the CAP warnings already list it", async () => {
    const warnings: AlertsResult = {
      status: "ok",
      activeCount: 1,
      groups: [
        {
          name: "Marine",
          alerts: [
            {
              identifier: "GD-1",
              event: "Small craft",
              headline: "Small craft advisory",
              severity: "Minor",
              status: "Actual",
              areas: [],
              expires: null,
            },
          ],
        },
      ],
    };
    vi.mocked(fetchActiveAlerts).mockResolvedValue(warnings);
    vi.mocked(fetchSectorOutlook).mockResolvedValue(
      outlook([green({ identifier: "GD-1" })])
    );
    expect(await fetchMastheadAlerts()).toMatchObject({
      green: { status: "ok", count: 0 },
    });
  });

  it("is unavailable when the warning feed is, whatever the outlook says", async () => {
    vi.mocked(fetchActiveAlerts).mockResolvedValue({ status: "unavailable" });
    vi.mocked(fetchSectorOutlook).mockResolvedValue(outlook([green()]));
    expect(await fetchMastheadAlerts()).toEqual({ status: "unavailable" });
  });
});
