import type { BookingPublicAddOn } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  addOnsFor,
  addOnTotals,
  amountDueForSelection,
  MAX_ADD_ONS,
  toggleAddOn,
} from "./add-ons";

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

describe("amountDueForSelection", () => {
  const plain = { deposit_minor: 0, due_at_booking_minor: 0 };

  it("is the storefront's figure with no add-ons", () => {
    expect(amountDueForSelection({ addOnCount: 0, service: plain })).toEqual({
      dueMinor: 0,
      emailCodeRequired: false,
    });
    expect(
      amountDueForSelection({
        addOnCount: 0,
        service: { deposit_minor: 0, due_at_booking_minor: 4500 },
      })
    ).toEqual({ dueMinor: 4500, emailCodeRequired: true });
  });

  it("keeps the service's own deposit, which ignores add-ons", () => {
    expect(
      amountDueForSelection({
        addOnCount: 2,
        service: { deposit_minor: 3000, due_at_booking_minor: 3000 },
      })
    ).toEqual({ dueMinor: 3000, emailCodeRequired: true });
  });

  it("does not guess when a rule or full price could apply to the total", () => {
    // 30% of EC$100 plus a EC$50 add-on is not EC$30: say nothing.
    expect(
      amountDueForSelection({
        addOnCount: 1,
        service: { deposit_minor: 0, due_at_booking_minor: 3000 },
      })
    ).toEqual({ dueMinor: null, emailCodeRequired: null });
    // Full-price mode: due equals the price, above the own deposit.
    expect(
      amountDueForSelection({
        addOnCount: 1,
        service: { deposit_minor: 1000, due_at_booking_minor: 10_000 },
      })
    ).toEqual({ dueMinor: null, emailCodeRequired: null });
    // A free-looking service may cross the minimum price with an add-on.
    expect(amountDueForSelection({ addOnCount: 1, service: plain })).toEqual({
      dueMinor: null,
      emailCodeRequired: null,
    });
  });

  it("uses the API's figures when they are given", () => {
    expect(
      amountDueForSelection({
        addOnCount: 1,
        fromApi: { dueMinor: 4500, emailCodeRequired: true },
        service: plain,
      })
    ).toEqual({ dueMinor: 4500, emailCodeRequired: true });
  });
});
