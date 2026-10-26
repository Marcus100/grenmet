import { productFields } from "@barrelsgd/gms/products";
import { expect, it } from "vitest";
import { startsRow } from "./product-field-control";

function rowStarts(kind: "morning" | "evening", section: string) {
  const fields = productFields(kind).filter((f) => f.section === section);
  return fields
    .filter((f, index) => startsRow(f, fields[index - 1]))
    .map((f) => f.key);
}

it("keeps maximum and minimum on one row of their own", () => {
  // The minimum follows the maximum, so only the maximum opens the row.
  expect(rowStarts("morning", "Weather")).toEqual(["maxTemperature"]);
  expect(rowStarts("evening", "Day 2")).toEqual(["day2Max"]);
});

it("starts swell direction on a new row", () => {
  expect(rowStarts("morning", "Marine")).toEqual(["swellDir"]);
  expect(rowStarts("evening", "Day 1 · Marine")).toEqual(["day1SwellDir"]);
});
