import { describe, expect, it } from "vitest";
import {
  normalizeDescriptor,
  searchWmoFields,
  wmoReference,
} from "./wmo-reference";

describe("WMO reference", () => {
  it.each(["012101", "0-12-101", "0 12 101"])(
    "finds a descriptor written as %s",
    (query) => {
      expect(searchWmoFields(query).map((field) => field.id)).toEqual([
        "012101",
      ]);
    }
  );
  it("supports existing unpadded registry notation", () => {
    expect(normalizeDescriptor("0-1-1")).toBe("001001");
    expect(normalizeDescriptor("4-12-101")).toBeUndefined();
  });
  it("finds code meanings without confusing them with descriptor IDs", () => {
    expect(searchWmoFields("nsc").map((field) => field.id)).toContain("020009");
    expect(searchWmoFields("unknown-field")).toEqual([]);
  });
  it("preserves temperature and pressure encoding units and precision", () => {
    expect(searchWmoFields("012101")[0]).toMatchObject({ unit: "K", scale: 2 });
    expect(searchWmoFields("010051")[0]).toMatchObject({
      unit: "Pa",
      scale: -1,
    });
  });
  it("preserves missing and reserved values as reference entries", () => {
    const weather = searchWmoFields("020009")[0];
    expect(weather.codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "0", meaning: "Reserved" }),
        expect.objectContaining({ code: "15", meaning: "Missing value" }),
      ])
    );
  });
  it("keeps report identities and sequence members", () => {
    expect(wmoReference.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "0",
          subcategory: "10",
          name: "Routine aeronautical observations (METAR)",
        }),
        expect.objectContaining({
          category: "0",
          subcategory: "11",
          name: "Special aeronautical observations (SPECI)",
        }),
      ])
    );
    const synop = wmoReference.sequences.find(
      (sequence) => sequence.id === "307080"
    );
    expect(synop?.members[0].id).toBe("301090");
    expect(synop?.members.map((member) => member.id)).toContain("101002");
  });
});
