import { productFields } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { visibleProductFields } from "./visible-fields";

const KINDS = ["morning", "midday", "evening"] as const;

describe("visibleProductFields", () => {
  it.each(KINDS)("drops the alert and impact fields for %s", (kind) => {
    const keys = visibleProductFields(kind).map((f) => f.key);

    expect(keys).not.toContain("weatherAlert");
    expect(keys).not.toContain("windAlert");
    expect(keys).not.toContain("marineAlert");

    // The five hazard "… impacts" sections go entirely.
    const sections = new Set(visibleProductFields(kind).map((f) => f.section));
    for (const section of [
      "Weather impacts",
      "Wind impacts",
      "Marine impacts",
      "Heat impacts",
      "Dust impacts",
      "Risk assessment",
    ]) {
      expect(sections.has(section)).toBe(false);
    }
  });

  it("shows only tonight's minimum and no sun times on the evening form", () => {
    const keys = visibleProductFields("evening").map((f) => f.key);
    expect(keys).toContain("minTemperature");
    for (const hidden of ["maxTemperature", "sunrise", "sunset"]) {
      expect(keys).not.toContain(hidden);
    }
    // Each outlook day keeps its own sun times.
    expect(keys).toContain("day1Sunrise");
    expect(keys).toContain("day4Sunset");
  });

  it("gives every evening outlook day the first period's Conditions and Chance of rain", () => {
    const fields = visibleProductFields("evening");
    const byKey = new Map(fields.map((f) => [f.key, f]));
    for (const day of [1, 2, 3, 4]) {
      for (const [name, label] of [
        ["Condition", "Conditions"],
        ["RainChance", "Chance of rain"],
      ] as const) {
        const field = byKey.get(`day${day}${name}`);
        expect(field?.label).toBe(label);
        expect(field?.section).toBe(`Day ${day}`);
        // Optional, so issues saved before 10 Nov 2026 still open.
        expect(field?.required).toBeFalsy();
        expect(field?.options).toEqual(
          byKey.get(name === "Condition" ? "condition" : "rainChance")?.options
        );
      }
    }
  });

  it.each(["morning", "midday"] as const)(
    "requires today's maximum on the %s form",
    (kind) => {
      const max = visibleProductFields(kind).find(
        (f) => f.key === "maxTemperature"
      );
      expect(max?.required).toBe(true);
    }
  );

  it.each(KINDS)("keeps the substantive forecast fields for %s", (kind) => {
    const keys = visibleProductFields(kind).map((f) => f.key);

    expect(keys).toContain("summary");
    expect(keys).toContain("wind");
    expect(keys).toContain("seaState");
    expect(keys).toContain("minTemperature");
  });

  it("removes exactly the 28 hidden fields and nothing else", () => {
    const all = productFields("morning");
    const visible = visibleProductFields("morning");

    // 3 alerts + (5 hazards x 4 impact fields) + 3 risk-assessment fields
    // + the older free-text sunrise and sunset (morning shows sunset today
    // and sunrise tomorrow instead).
    expect(all.length - visible.length).toBe(28);
  });

  it("leaves the shared schema itself untouched", () => {
    // The public GMS site and the products API still see every field.
    const keys = productFields("morning").map((f) => f.key);
    expect(keys).toContain("weatherAlert");
    expect(keys).toContain("weatherLikelihood");
    expect(keys).toContain("likelihood");
  });
});

it("omits legacy per-day assessments from the evening display", () => {
  const keys = visibleProductFields("evening").map((field) => field.key);
  expect(keys).not.toContain("day1Alerts");
  expect(keys).not.toContain("day4Impact");
});
