import { describe, expect, it } from "vitest";
import { highestSeverity, severityRank } from "./cap-severity";

describe("severityRank", () => {
  it("orders Unknown < Minor < Moderate < Severe < Extreme", () => {
    expect(severityRank("Unknown")).toBeLessThan(severityRank("Minor"));
    expect(severityRank("Minor")).toBeLessThan(severityRank("Moderate"));
    expect(severityRank("Moderate")).toBeLessThan(severityRank("Severe"));
    expect(severityRank("Severe")).toBeLessThan(severityRank("Extreme"));
  });

  it("treats a missing severity as Unknown", () => {
    expect(severityRank(null)).toBe(severityRank("Unknown"));
    expect(severityRank(undefined)).toBe(severityRank("Unknown"));
  });
});

describe("highestSeverity", () => {
  it("picks the most severe of several active alerts sharing a parish", () => {
    expect(highestSeverity(["Minor", "Severe", "Moderate"])).toBe("Severe");
  });

  it("ignores missing severities and falls back to Unknown for an empty list", () => {
    expect(highestSeverity([null, undefined])).toBe("Unknown");
    expect(highestSeverity([])).toBe("Unknown");
  });
});
