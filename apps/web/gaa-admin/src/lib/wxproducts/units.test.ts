import { productFields } from "@barrelsgd/gms/products";
import { expect, it } from "vitest";
import {
  productCanonicalValue,
  productFieldCaption,
  productFieldLabel,
  productFieldUnit,
  productFieldValue,
} from "./units";

it.each([
  ["morning", "windSpeedMin", "Speed from (mph)", "10", "11.51"],
  ["evening", "day1WindGust", "Gusts (mph)", "20", "23.02"],
  ["marine", "waveHeightMin", "Waves from (ft)", "1.8", "5.91"],
  ["morning", "tide1Height", "Tide 1 height (ft)", "-0.2", "-0.66"],
  ["morning", "swellHeight", "Swell height (ft)", "0", "0"],
] as const)(
  "presents %s %s in preferred units and round-trips entered values",
  (kind, key, label, canonical, displayed) => {
    const field = productFields(kind).find((f) => f.key === key);
    if (!field) throw new Error(`Missing ${key}`);
    expect(productFieldLabel(field)).toBe(label);
    expect(productFieldValue(field, canonical)).toBe(displayed);
    const saved = productCanonicalValue(field, displayed);
    expect(productFieldValue(field, saved)).toBe(displayed);
    expect(productCanonicalValue(field, "")).toBe("");
    expect(productFieldValue(field, "invalid")).toBe("invalid");
  }
);

it("keeps Celsius and non-height measurements unchanged", () => {
  for (const key of ["minTemperature", "rainChance"]) {
    const field = productFields("morning").find((f) => f.key === key);
    if (!field) throw new Error(`Missing ${key}`);
    expect(productFieldLabel(field)).toBe(field.label);
    expect(productFieldValue(field, "24.25")).toBe("24.25");
    expect(productCanonicalValue(field, "24.25")).toBe("24.25");
  }
});

it("uses short persistent captions and separates units from complete accessible labels", () => {
  const fields = productFields("morning");
  const max = fields.find((f) => f.key === "maxTemperature");
  const speed = fields.find((f) => f.key === "windSpeedMin");
  if (!(max && speed)) throw new Error("Missing fields");
  expect(productFieldCaption(max)).toBe("Max temp");
  expect(productFieldUnit(max)).toBe("°C");
  expect(productFieldLabel(max)).toBe("Maximum temperature (°C)");
  expect(productFieldCaption(speed)).toBe("Min");
  expect(productFieldUnit(speed)).toBe("mph");
});
