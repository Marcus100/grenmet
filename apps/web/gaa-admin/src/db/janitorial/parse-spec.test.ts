import { describe, expect, it } from "vitest";
import {
  formatFrequency,
  parseFrequency,
  parseSpec,
  slugify,
} from "./parse-spec";

const FIXTURE = [
  "kind,building,section,area,mode,activity,frequency",
  'bundle_item,,,Terrazzo Maintenance,,"Sweep Terrazzo",2/1',
  'bundle_item,,,Terrazzo Maintenance,,"Seal Terrazzo",1/120',
  'task,Air Terminal Building (ATB),Offices,Reception,,"Empty Bins/Dispose of Litter",1/1',
  'task,Air Terminal Building (ATB),Offices,Reception,,"Sweep and mop floors",2/1',
  'bundle_ref,Air Terminal Building (ATB),Offices,Reception,,"Terrazzo Maintenance",',
  'task,Air Terminal Building (ATB),,Restrooms,,"Empty Bins/Dispose of Litter",4/1',
  'task,Air Terminal Building (ATB),Lounge,Executive,Light Cleaning,"Empty Bins/Dispose of Litter",2/1',
  'task,Air Terminal Building (ATB),Lounge,Executive,Deep Cleaning,"Deep Clean Toilets & Tiles",1/1',
].join("\n");

describe("parseFrequency", () => {
  it("parses a per-day cadence", () => {
    expect(parseFrequency("2/1")).toEqual({
      count: 2,
      periodValue: 1,
      periodUnit: "day",
    });
  });

  it("parses a per-minute cadence", () => {
    expect(parseFrequency("1/15min")).toEqual({
      count: 1,
      periodValue: 15,
      periodUnit: "minute",
    });
  });

  it("parses a multi-day cadence", () => {
    expect(parseFrequency("2/180")).toEqual({
      count: 2,
      periodValue: 180,
      periodUnit: "day",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseFrequency("  1/120 ")).toEqual({
      count: 1,
      periodValue: 120,
      periodUnit: "day",
    });
  });

  it("throws on an invalid code", () => {
    expect(() => parseFrequency("daily")).toThrow("Invalid frequency");
  });
});

describe("formatFrequency", () => {
  it("formats singular and plural periods", () => {
    expect(
      formatFrequency({ count: 2, periodValue: 1, periodUnit: "day" })
    ).toBe("2×/day");
    expect(
      formatFrequency({ count: 3, periodValue: 5, periodUnit: "day" })
    ).toBe("3×/5 days");
    expect(
      formatFrequency({ count: 1, periodValue: 15, periodUnit: "minute" })
    ).toBe("1×/15 mins");
  });
});

describe("slugify", () => {
  it("keeps distinct wording distinct (verbatim policy)", () => {
    expect(slugify("Cobweb Ceiling")).toBe("cobweb-ceiling");
    expect(slugify("Cobweb Ceilings")).toBe("cobweb-ceilings");
    expect(slugify("Empty Bins/Dispose of Litter")).toBe(
      "empty-bins-dispose-of-litter"
    );
  });
});

describe("parseSpec", () => {
  const spec = parseSpec(FIXTURE);

  it("dedupes buildings and activities by slug", () => {
    expect(spec.buildings).toHaveLength(1);
    expect(spec.buildings[0].code).toBe("air-terminal-building-atb");
    // "Empty Bins/Dispose of Litter" appears in 3 areas -> one activity.
    const emptyBins = spec.activities.filter(
      (a) => a.slug === "empty-bins-dispose-of-litter"
    );
    expect(emptyBins).toHaveLength(1);
    // Sweep Terrazzo, Seal Terrazzo, Empty Bins, Sweep and mop floors, Deep Clean.
    expect(spec.activities).toHaveLength(5);
  });

  it("only records real sections, leaving section-less areas null", () => {
    expect(spec.sections.map((s) => s.name)).toEqual(["Offices", "Lounge"]);
    const restrooms = spec.areas.find((a) => a.name === "Restrooms");
    expect(restrooms?.sectionName).toBeNull();
    expect(spec.areas).toHaveLength(3);
  });

  it("captures cleaning modes on tasks", () => {
    const executiveTasks = spec.areaTasks.filter((t) =>
      t.areaKey.endsWith("::Executive")
    );
    expect(executiveTasks.map((t) => t.mode)).toEqual([
      "Light Cleaning",
      "Deep Cleaning",
    ]);
    const reception = spec.areaTasks.filter((t) =>
      t.areaKey.endsWith("::Reception")
    );
    expect(reception.every((t) => t.mode === null)).toBe(true);
  });

  it("wires the bundle definition and its reference", () => {
    expect(spec.bundles).toHaveLength(1);
    expect(spec.bundleItems).toHaveLength(2);
    expect(spec.areaBundleRefs).toHaveLength(1);
    expect(spec.areaBundleRefs[0].bundleSlug).toBe("terrazzo-maintenance");
    expect(spec.areaBundleRefs[0].areaKey).toContain("::Reception");
  });

  it("orders tasks within an area, with the bundle ref last", () => {
    const reception = spec.areaTasks
      .filter((t) => t.areaKey.endsWith("::Reception"))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(reception.map((t) => t.sortOrder)).toEqual([0, 1]);
    // The bundle ref shares the per-area counter, so it sorts after the 2 tasks.
    expect(spec.areaBundleRefs[0].sortOrder).toBe(2);
  });

  it("stores frequencies structured", () => {
    const restroomBins = spec.areaTasks.find((t) =>
      t.areaKey.endsWith("::Restrooms")
    );
    expect(restroomBins?.frequency).toEqual({
      count: 4,
      periodValue: 1,
      periodUnit: "day",
    });
  });
});
