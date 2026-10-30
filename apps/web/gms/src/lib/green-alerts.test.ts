import type {
  PublicWarning,
  SectorOutlook,
  SectorOutlookItem,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import type { AlertsResult } from "@/lib/cap-alerts";
import { greenAlerts } from "@/lib/green-alerts";

const NOW = new Date("2026-10-30T14:00:00Z");
const NO_WARNINGS: AlertsResult = { status: "ok", activeCount: 0, groups: [] };
const CAP_WARNING: PublicWarning = {
  identifier: "GD-1",
  event: "Small craft",
  headline: "Small craft advisory",
  severity: "Minor",
  status: "Actual",
  areas: [],
  expires: null,
};

function item(overrides: Partial<SectorOutlookItem>): SectorOutlookItem {
  return {
    source: "Bulletin",
    title: "Green item",
    product: "Marine",
    colour: "green",
    impacts: "Routine conditions. Stay informed.",
    response: "",
    valid_from: "2026-10-29T12:00:00Z",
    valid_to: "2026-11-02T12:00:00Z",
    reference: "ref-1",
    identifier: null,
    product_id: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
    sectors: [],
    affects_everyone: true,
    ...overrides,
  };
}

function outlook(items: SectorOutlookItem[], complete = true): SectorOutlook {
  return {
    as_of: NOW.toISOString(),
    window_start: "2026-10-30T04:00:00Z",
    window_end: "2026-11-06T04:00:00Z",
    complete,
    items,
  };
}

describe("greenAlerts", () => {
  it("is unavailable, never empty, when the outlook did not load", () => {
    expect(greenAlerts(null, NO_WARNINGS, NOW)).toEqual({
      status: "unavailable",
    });
  });

  it("lists Green items in effect now, with their time and link", () => {
    const result = greenAlerts(outlook([item({})]), NO_WARNINGS, NOW);
    expect(result).toEqual({
      status: "ok",
      complete: true,
      items: [
        {
          id: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
          title: "Green item",
          summary: "Routine conditions.",
          when: "In effect until Mon 2 Nov",
          href: "/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
        },
      ],
    });
  });

  it("leaves out Yellow and above, which are CAP warnings", () => {
    const result = greenAlerts(
      outlook([item({ colour: "yellow" }), item({ colour: null })]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("leaves out Green items that have not started yet or have ended", () => {
    const result = greenAlerts(
      outlook([
        item({ reference: "later", valid_from: "2026-11-03T12:00:00Z" }),
        item({ reference: "over", valid_to: "2026-10-29T12:00:00Z" }),
      ]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("does not repeat a Green item that is already a CAP warning above", () => {
    const warnings: AlertsResult = {
      status: "ok",
      activeCount: 1,
      groups: [
        {
          name: "Marine",
          alerts: [{ ...CAP_WARNING, identifier: "GD-1" }],
        },
      ],
    };
    const result = greenAlerts(
      outlook([item({ identifier: "GD-1", title: "Repeat" })]),
      warnings,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", items: [] });
  });

  it("carries the outlook's incomplete flag so the page can say so", () => {
    const result = greenAlerts(outlook([], false), NO_WARNINGS, NOW);
    expect(result).toMatchObject({ status: "ok", complete: false, items: [] });
  });
});
