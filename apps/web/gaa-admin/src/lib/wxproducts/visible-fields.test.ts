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

  it.each(KINDS)("keeps the substantive forecast fields for %s", (kind) => {
    const keys = visibleProductFields(kind).map((f) => f.key);

    expect(keys).toContain("summary");
    expect(keys).toContain("wind");
    expect(keys).toContain("seaState");
    expect(keys).toContain("minTemperature");
  });

  it("removes exactly the 23 hidden fields and nothing else", () => {
    const all = productFields("morning");
    const visible = visibleProductFields("morning");

    // 3 alerts + (5 hazards x 4 impact fields) + 3 risk-assessment fields.
    expect(all.length - visible.length).toBe(26);
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
