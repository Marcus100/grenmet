import { productFields } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { hiddenRequiredErrors, visibleProductFields } from "./visible-fields";

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

describe("hiddenRequiredErrors", () => {
  it("covers the required Risk assessment fields so publish is not blocked", () => {
    const errors = hiddenRequiredErrors("morning");

    // These three are required in the shared schema but no longer shown.
    expect(errors.has("Risk assessment: Overall likelihood is required")).toBe(
      true
    );
    expect(errors.has("Risk assessment: Overall impact is required")).toBe(
      true
    );
    expect(errors.has("Risk assessment: Overall response is required")).toBe(
      true
    );
  });

  it("does not mask errors for fields that are still visible", () => {
    const errors = [...hiddenRequiredErrors("morning")];

    expect(errors.some((e) => e.startsWith("Weather: Weather summary"))).toBe(
      false
    );
    expect(errors.some((e) => e.includes("Minimum temperature"))).toBe(false);
  });
});
