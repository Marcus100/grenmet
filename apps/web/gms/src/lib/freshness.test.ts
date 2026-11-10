import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_TOLERANCE_MS,
  FORECAST_ISSUED_FALLBACK_MS,
  forecastValidity,
  isForecastIssueStale,
  isSatelliteStale,
  isStale,
  OBSERVATION_STALE_AFTER_MS,
  observationNote,
  SATELLITE_STALE_AFTER_MS,
  validityNote,
} from "@/lib/freshness";

// Grenada is UTC-4 all year. 18:00Z is 14:00 AST on 10 Nov 2026.
const NOW = new Date("2026-11-10T18:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const OTHER_DAY_NOTE = /^Observed 1 day ago \(9 Nov, 11:00 a\.m\. AST\)/u;

describe("observation limit", () => {
  it("is two hours, with the reason in the module", () => {
    expect(OBSERVATION_STALE_AFTER_MS).toBe(2 * HOUR);
  });

  it("is still fresh at exactly two hours and stale one millisecond later", () => {
    const exact = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    const justOver = new Date(NOW.getTime() - 2 * HOUR - 1).toISOString();
    expect(isStale(exact, NOW)).toBe(false);
    expect(isStale(justOver, NOW)).toBe(true);
  });

  it("reads a reading from an hour ago as fresh", () => {
    expect(isStale("2026-11-10T13:00", NOW)).toBe(false);
  });

  it("reads a reading from three hours ago as stale", () => {
    expect(isStale("2026-11-10T11:00", NOW)).toBe(true);
  });

  it("reads offset-less Grenada times and offset times alike", () => {
    expect(isStale("2026-11-10T14:00", NOW)).toBe(false);
    expect(isStale("2026-11-10T14:00:00-04:00", NOW)).toBe(false);
    expect(isStale("2026-11-10T11:00:00Z", NOW)).toBe(true);
  });
});

describe("missing and unreadable timestamps", () => {
  it("treats a missing time as stale", () => {
    expect(isStale(undefined, NOW)).toBe(true);
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("", NOW)).toBe(true);
  });

  it("treats an unreadable time as stale", () => {
    expect(isStale("not a time", NOW)).toBe(true);
    expect(isSatelliteStale("not a time", NOW)).toBe(true);
    expect(forecastValidity("not a time", NOW)).toBe("unknown");
  });

  it("says the observation time is not supplied", () => {
    expect(observationNote(null, NOW)).toBe(
      "Observation time not supplied, so treat this reading as older than usual."
    );
  });
});

describe("clock skew", () => {
  it("counts a reading a few minutes ahead of the server clock as fresh", () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(5 * MINUTE);
    expect(isStale("2026-11-10T14:04", NOW)).toBe(false);
    expect(observationNote("2026-11-10T14:04", NOW)).toBeNull();
  });

  it("does not trust a reading far ahead of the server clock", () => {
    expect(isStale("2026-11-10T14:06", NOW)).toBe(true);
    expect(observationNote("2026-11-10T14:06", NOW)).toBe(
      "Observation time could not be checked, so treat this reading as older than usual."
    );
  });
});

describe("observationNote", () => {
  it("is null while the reading is fresh", () => {
    expect(observationNote("2026-11-10T13:30", NOW)).toBeNull();
  });

  it("says how long ago a stale reading was taken, in Grenada time", () => {
    expect(observationNote("2026-11-10T11:00", NOW)).toBe(
      "Observed 3 hours ago (11:00 a.m. AST) — older than usual"
    );
  });

  it("names the day when the reading is from another Grenada day", () => {
    const note = observationNote("2026-11-09T11:00", NOW);
    expect(note).toMatch(OTHER_DAY_NOTE);
  });

  it("agrees with isStale at every boundary it is tested against", () => {
    for (const minutes of [0, 60, 119, 120, 121, 240, 1500]) {
      const iso = new Date(NOW.getTime() - minutes * MINUTE).toISOString();
      expect(observationNote(iso, NOW) !== null).toBe(isStale(iso, NOW));
    }
  });
});

describe("forecast validity", () => {
  it("is in effect until valid-to, and expired from that moment", () => {
    const validTo = "2026-11-10T05:00";
    expect(
      forecastValidity(validTo, new Date("2026-11-10T08:59:59.999Z"))
    ).toBe("in-effect");
    expect(forecastValidity(validTo, new Date("2026-11-10T09:00:00Z"))).toBe(
      "expired"
    );
  });

  it("is unknown when the valid-to is missing", () => {
    expect(forecastValidity(undefined, NOW)).toBe("unknown");
    expect(forecastValidity(null, NOW)).toBe("unknown");
  });
});

describe("validityNote", () => {
  it("is null while a forecast is in effect", () => {
    expect(
      validityNote("2026-11-10T18:00", NOW, { forecast: true })
    ).toBeNull();
  });

  it("says a forecast expired at its valid-to and names the next issue", () => {
    // 09:00Z is 05:00 AST: the forecast's end time, so it has just expired.
    expect(
      validityNote("2026-11-10T05:00", new Date("2026-11-10T09:00:00Z"), {
        forecast: true,
      })
    ).toBe(
      "This forecast expired at 5:00 a.m. AST; the next issue is due 7:00 a.m."
    );
  });

  it("uses the Marine Forecast's own 05:00 issue for a marine forecast", () => {
    // 10:00Z is 06:00 AST, after the 05:00 issue; the next is tomorrow.
    expect(
      validityNote("2026-11-09T05:00", new Date("2026-11-10T10:00:00Z"), {
        forecast: true,
        kinds: ["marine-forecast"],
      })
    ).toBe(
      "This forecast expired at 9 Nov, 5:00 a.m. AST; the next issue is due 5:00 a.m. tomorrow."
    );
  });

  it("tells a non-forecast product to check for a newer issue", () => {
    expect(
      validityNote("2026-11-10T05:00", new Date("2026-11-10T09:00:00Z"), {
        forecast: false,
      })
    ).toBe("This product expired at 5:00 a.m. AST. Check for a newer issue.");
  });

  it("says validity is not supplied when there is no valid-to", () => {
    expect(validityNote(undefined, NOW, { forecast: true })).toBe(
      "Validity time not supplied. Check for a newer issue."
    );
  });
});

describe("other limits", () => {
  it("flags a satellite image after 30 minutes", () => {
    expect(SATELLITE_STALE_AFTER_MS).toBe(30 * MINUTE);
    const at30 = new Date(NOW.getTime() - 30 * MINUTE).toISOString();
    const at31 = new Date(NOW.getTime() - 31 * MINUTE).toISOString();
    expect(isSatelliteStale(at30, NOW)).toBe(false);
    expect(isSatelliteStale(at31, NOW)).toBe(true);
  });

  it("flags a forecast issued more than 12 hours ago when no valid-to is given", () => {
    expect(FORECAST_ISSUED_FALLBACK_MS).toBe(12 * HOUR);
    // 03:00 AST is 11 hours before 14:00 AST.
    expect(isForecastIssueStale("2026-11-10T03:00", NOW)).toBe(false);
    expect(isForecastIssueStale("2026-11-09T01:00", NOW)).toBe(true);
  });
});
