import { describe, expect, it } from "vitest";
import {
  type AlertsResult,
  alertsDisplayLevel,
  alertsSummary,
  type GreenStatus,
} from "@/lib/cap-alerts";

const NONE: AlertsResult = { status: "ok", activeCount: 0, groups: [] };
const green = (
  count: number,
  overrides: Partial<Extract<GreenStatus, { status: "ok" }>> = {}
): GreenStatus => ({
  status: "ok",
  count,
  other: 0,
  complete: true,
  ...overrides,
});

describe("alertsSummary with the GMS outlook", () => {
  it("says no active alerts only when the outlook is read in full and empty", () => {
    expect(alertsSummary(NONE)).toBe("No active alerts");
    expect(alertsSummary(NONE, green(0))).toBe("No active alerts");
  });

  it("names Green alerts in effect, singular and plural", () => {
    expect(alertsSummary(NONE, green(1))).toBe("Green alert in effect");
    expect(alertsSummary(NONE, green(2))).toBe("2 Green alerts in effect");
  });

  it("is never an all-clear when Green alerts cannot be read", () => {
    expect(alertsSummary(NONE, { status: "unavailable" })).toBe(
      "Green alerts unavailable"
    );
  });

  it("is never an all-clear for an incomplete read with nothing listed", () => {
    expect(alertsSummary(NONE, green(0, { complete: false }))).toBe(
      "Alert information may be incomplete"
    );
  });

  it("names Green alerts in effect and says the list may be incomplete", () => {
    expect(alertsSummary(NONE, green(1, { complete: false }))).toBe(
      "Green alert in effect · may be incomplete"
    );
  });

  it("names GMS items in effect that are not yet warnings, never 'no alerts'", () => {
    expect(alertsSummary(NONE, green(0, { other: 1 }))).toBe(
      "GMS alert in effect"
    );
    expect(alertsSummary(NONE, green(1, { other: 3 }))).toBe(
      "3 GMS alerts in effect"
    );
  });

  it("keeps the CAP wording when a warning is in effect", () => {
    const warning: AlertsResult = {
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
              severity: "Moderate",
              status: "Actual",
              areas: [],
              expires: null,
            },
          ],
        },
      ],
    };
    expect(alertsSummary(warning, green(2))).toBe("Be prepared · 1 active");
  });
});

describe("alertsDisplayLevel", () => {
  it("is calm only when the outlook is read in full and empty", () => {
    expect(alertsDisplayLevel(NONE, green(0))).toBe("none");
    expect(alertsDisplayLevel(NONE, green(1))).toBe("none");
    expect(alertsDisplayLevel(NONE)).toBe("none");
  });

  it("is grey when Green alerts are unreadable", () => {
    expect(alertsDisplayLevel(NONE, { status: "unavailable" })).toBe("unknown");
  });

  it("is grey for an incomplete read with nothing listed, and for other GMS items", () => {
    expect(alertsDisplayLevel(NONE, green(0, { complete: false }))).toBe(
      "unknown"
    );
    expect(alertsDisplayLevel(NONE, green(0, { other: 1 }))).toBe("unknown");
  });
});
