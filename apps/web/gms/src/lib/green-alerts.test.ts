import type {
  PublicWarning,
  SectorOutlook,
  SectorOutlookItem,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  type AlertsResult,
  alertsDisplayLevel,
  alertsSummary,
} from "@/lib/cap-alerts";
import { greenAlerts, greenStatus } from "@/lib/green-alerts";

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

/** A Green bulletin whose notice type is "All clear": information, not an alert. */
function allClear(
  overrides: Partial<SectorOutlookItem> = {}
): SectorOutlookItem {
  return item({
    title: "Calm seas",
    notice_type: "All clear",
    product_id: "0b3c6f1e-5555-4a2b-9c3d-666677778888",
    ...overrides,
  });
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
      other: 0,
      information: [],
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

  it("counts a non-Green GMS item in effect with no CAP warning, never ignoring it", () => {
    const result = greenAlerts(
      outlook([item({ colour: "yellow", identifier: null, title: "Gale" })]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", items: [], other: 1 });
  });

  it("counts a non-Green item with no colour too, and not one a CAP warning already lists", () => {
    const warnings: AlertsResult = {
      status: "ok",
      activeCount: 1,
      groups: [
        {
          name: "Marine",
          alerts: [{ ...CAP_WARNING, identifier: "GD-2" }],
        },
      ],
    };
    const result = greenAlerts(
      outlook([
        item({ colour: null, identifier: null, reference: "outlook" }),
        item({ colour: "orange", identifier: "GD-2", reference: "listed" }),
      ]),
      warnings,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", other: 1 });
  });

  it("does not count Green items as other", () => {
    const result = greenAlerts(outlook([item({})]), NO_WARNINGS, NOW);
    expect(result).toMatchObject({
      items: [{ title: "Green item" }],
      other: 0,
    });
  });
});

describe("All clear bulletins are information, not alerts in effect", () => {
  it("lists an All clear in effect as information, not as a Green alert", () => {
    const result = greenAlerts(outlook([allClear()]), NO_WARNINGS, NOW);
    expect(result).toEqual({
      status: "ok",
      complete: true,
      other: 0,
      items: [],
      information: [
        {
          id: "0b3c6f1e-5555-4a2b-9c3d-666677778888",
          title: "Calm seas",
          when: "In effect until Mon 2 Nov",
          href: "/weather/issued/0b3c6f1e-5555-4a2b-9c3d-666677778888",
        },
      ],
    });
  });

  it("says No active alerts, with nothing counted, when only an All clear is in effect", () => {
    const green = greenAlerts(outlook([allClear()]), NO_WARNINGS, NOW);
    expect(greenStatus(green)).toEqual({
      status: "ok",
      count: 0,
      other: 0,
      complete: true,
    });
    expect(alertsSummary(NO_WARNINGS, greenStatus(green))).toBe(
      "No active alerts"
    );
    expect(alertsDisplayLevel(NO_WARNINGS, greenStatus(green))).toBe("none");
  });

  it("counts only the Green alert when an All clear is also in effect", () => {
    const green = greenAlerts(
      outlook([allClear(), item({ title: "Green item", reference: "g" })]),
      NO_WARNINGS,
      NOW
    );
    expect(greenStatus(green)).toMatchObject({ count: 1, other: 0 });
    expect(green).toMatchObject({
      items: [{ title: "Green item" }],
      information: [{ title: "Calm seas" }],
    });
    expect(alertsSummary(NO_WARNINGS, greenStatus(green))).toBe(
      "Green alert in effect"
    );
  });

  it("stays grey for an incomplete read, even with an All clear listed", () => {
    const green = greenAlerts(outlook([allClear()], false), NO_WARNINGS, NOW);
    expect(green).toMatchObject({
      status: "ok",
      complete: false,
      information: [{ title: "Calm seas" }],
    });
    expect(alertsDisplayLevel(NO_WARNINGS, greenStatus(green))).toBe("unknown");
    expect(alertsSummary(NO_WARNINGS, greenStatus(green))).toBe(
      "Alert information may be incomplete"
    );
  });

  it("leaves out an All clear that has not started or has ended", () => {
    const result = greenAlerts(
      outlook([
        allClear({ valid_from: "2026-11-03T12:00:00Z" }),
        allClear({ valid_to: "2026-10-29T12:00:00Z" }),
      ]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", information: [] });
  });

  it("keeps an All clear that is not Green as a GMS alert, never information", () => {
    const result = greenAlerts(
      outlook([allClear({ colour: "yellow" })]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({ status: "ok", other: 1, information: [] });
    expect(alertsDisplayLevel(NO_WARNINGS, greenStatus(result))).toBe(
      "unknown"
    );
  });

  it("lists an Information or Advisory Green bulletin as a Green alert", () => {
    const result = greenAlerts(
      outlook([
        item({ title: "Info", notice_type: "Information", reference: "i" }),
        item({ title: "Advice", notice_type: "Advisory", reference: "a" }),
      ]),
      NO_WARNINGS,
      NOW
    );
    expect(result).toMatchObject({
      items: [{ title: "Info" }, { title: "Advice" }],
      information: [],
    });
  });
});

describe("greenStatus", () => {
  it("maps the list to the masthead's counts", () => {
    const result = greenAlerts(
      outlook(
        [item({}), item({ colour: "red", identifier: null, reference: "r" })],
        false
      ),
      NO_WARNINGS,
      NOW
    );
    expect(greenStatus(result)).toEqual({
      status: "ok",
      count: 1,
      other: 1,
      complete: false,
    });
  });

  it("keeps an unreadable outlook unreadable", () => {
    expect(greenStatus({ status: "unavailable" })).toEqual({
      status: "unavailable",
    });
  });
});
