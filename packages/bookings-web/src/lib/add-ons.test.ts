import type { BookingPublicAddOn } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { addOnsFor, addOnTotals, MAX_ADD_ONS, toggleAddOn } from "./add-ons";

function addOn(id: string, serviceIds: string[]): BookingPublicAddOn {
  return {
    id,
    name: id,
    description: null,
    duration_min: 15,
    price_minor: 1000,
    service_ids: serviceIds,
  };
}

const a = addOn("a", ["s1"]);
const b = addOn("b", ["s1", "s2"]);
const c = addOn("c", ["s2"]);

describe("addOnsFor", () => {
  it("keeps only add-ons offered with the chosen service, in order", () => {
    expect(addOnsFor([a, b, c], "s1")).toEqual([a, b]);
    expect(addOnsFor([a, b, c], "s2")).toEqual([b, c]);
  });

  it("is empty with no service, no add-ons or none for the service", () => {
    expect(addOnsFor([a], null)).toEqual([]);
    expect(addOnsFor(undefined, "s1")).toEqual([]);
    expect(addOnsFor([c], "s1")).toEqual([]);
  });
});

describe("toggleAddOn", () => {
  it("adds, then removes", () => {
    expect(toggleAddOn([], "a", [a, b])).toEqual(["a"]);
    expect(toggleAddOn(["a", "b"], "a", [a, b])).toEqual(["b"]);
  });

  it("ignores an add-on that is not offered", () => {
    expect(toggleAddOn([], "z", [a])).toEqual([]);
  });

  it("refuses a sixth", () => {
    const many = Array.from({ length: 6 }, (_, i) => addOn(`x${i}`, ["s1"]));
    let chosen: string[] = [];
    for (const item of many) {
      chosen = toggleAddOn(chosen, item.id, many);
    }
    expect(chosen).toHaveLength(MAX_ADD_ONS);
    expect(chosen).not.toContain("x5");
    expect(toggleAddOn(chosen, "x0", many)).toHaveLength(MAX_ADD_ONS - 1);
  });
});

describe("addOnTotals", () => {
  const service = { duration_min: 60, price_minor: 5000 };

  it("is the service alone with nothing chosen", () => {
    expect(addOnTotals(service, [a, b], [])).toEqual({
      durationMin: 60,
      priceMinor: 5000,
    });
  });

  it("adds each chosen add-on's minutes and price", () => {
    expect(addOnTotals(service, [a, b], ["a", "b"])).toEqual({
      durationMin: 90,
      priceMinor: 7000,
    });
  });

  it("ignores a chosen id that is no longer offered", () => {
    expect(addOnTotals(service, [a], ["a", "gone"])).toEqual({
      durationMin: 75,
      priceMinor: 6000,
    });
  });
});
