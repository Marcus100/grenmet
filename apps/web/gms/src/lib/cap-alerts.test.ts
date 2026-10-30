import { describe, expect, it } from "vitest";
import {
  type AlertsResult,
  alertsDisplayLevel,
  alertsSummary,
} from "@/lib/cap-alerts";

const NONE: AlertsResult = { status: "ok", activeCount: 0, groups: [] };

describe("alertsSummary with Green alerts", () => {
  it("says no active alerts only when there are no Green alerts either", () => {
    expect(alertsSummary(NONE)).toBe("No active alerts");
    expect(alertsSummary({ ...NONE, green: { status: "ok", count: 0 } })).toBe(
      "No active alerts"
    );
  });

  it("names Green alerts in effect, singular and plural", () => {
    expect(alertsSummary({ ...NONE, green: { status: "ok", count: 1 } })).toBe(
      "Green alert in effect"
    );
    expect(alertsSummary({ ...NONE, green: { status: "ok", count: 2 } })).toBe(
      "2 Green alerts in effect"
    );
  });

  it("is never an all-clear when Green alerts cannot be read", () => {
    expect(alertsSummary({ ...NONE, green: { status: "unavailable" } })).toBe(
      "Green alerts unavailable"
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
      green: { status: "ok", count: 2 },
    };
    expect(alertsSummary(warning)).toBe("Be prepared · 1 active");
  });
});

describe("alertsDisplayLevel", () => {
  it("is grey when no warning is in effect and Green alerts are unreadable", () => {
    expect(
      alertsDisplayLevel({ ...NONE, green: { status: "unavailable" } })
    ).toBe("unknown");
  });

  it("is the calm green level when Green alerts are in effect or none", () => {
    expect(
      alertsDisplayLevel({ ...NONE, green: { status: "ok", count: 1 } })
    ).toBe("none");
    expect(alertsDisplayLevel(NONE)).toBe("none");
  });
});
