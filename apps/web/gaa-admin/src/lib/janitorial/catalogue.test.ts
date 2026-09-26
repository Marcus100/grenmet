import { describe, expect, it } from "vitest";
import {
  cadenceOf,
  filterAreas,
  findArea,
  flattenAreas,
  highFrequencyAreas,
  intervalMinutes,
  occurrencesPerDay,
  siteParam,
  summarise,
  workloadByBuilding,
} from "./catalogue";
import { catalogue, terminal, tower } from "./test-fixtures";

const buildings = catalogue.buildings;

describe("frequency maths", () => {
  it("converts cadences to occurrences per day and intervals", () => {
    const fifteenMinutes = { count: 1, periodValue: 15, periodUnit: "minute" };
    expect(occurrencesPerDay(fifteenMinutes)).toBe(96);
    expect(intervalMinutes(fifteenMinutes)).toBe(15);
    expect(
      occurrencesPerDay({ count: 3, periodValue: 5, periodUnit: "day" })
    ).toBeCloseTo(0.6);
  });

  it("buckets cadence by the most frequent interval", () => {
    expect(cadenceOf({ count: 1, periodValue: 60, periodUnit: "minute" })).toBe(
      "high"
    );
    expect(cadenceOf({ count: 2, periodValue: 1, periodUnit: "day" })).toBe(
      "daily"
    );
    expect(cadenceOf({ count: 1, periodValue: 7, periodUnit: "day" })).toBe(
      "periodic"
    );
    expect(cadenceOf(null)).toBe("periodic");
  });
});

describe("siteParam", () => {
  it("accepts known site codes in any case and defaults to MBIA", () => {
    expect(siteParam("cru")).toBe("CRU");
    expect(siteParam("GND")).toBe("GND");
    expect(siteParam("xyz")).toBe("GND");
    expect(siteParam(undefined)).toBe("GND");
    expect(siteParam(["CRU"])).toBe("GND");
  });
});

describe("flattenAreas", () => {
  it("combines active tasks and bundle items per area", () => {
    const rows = flattenAreas(buildings);
    expect(rows.map((row) => row.id)).toEqual([10, 11, 12, 20]);

    const restrooms = rows[0];
    // The inactive 5-minute task is ignored.
    expect(restrooms?.perDay).toBe(96);
    expect(restrooms?.fastest?.periodValue).toBe(15);
    expect(restrooms?.cadence).toBe("high");
    expect(restrooms?.code).toBe("GND-A0010");
    expect(restrooms?.sectionName).toBeNull();

    const reception = rows[1];
    expect(reception?.sectionName).toBe("Meeting Rooms & Office Spaces");
    expect(reception?.bundleNames).toEqual([
      "Terrazzo Maintenance and Floor Care",
    ]);
    expect(reception?.cadence).toBe("periodic");
    expect(rows[2]?.active).toBe(false);
  });
});

describe("filterAreas", () => {
  const rows = flattenAreas(buildings);

  it("hides inactive areas unless asked", () => {
    expect(filterAreas(rows, {}).map((r) => r.id)).toEqual([10, 11, 20]);
    expect(filterAreas(rows, { status: "all" })).toHaveLength(4);
  });

  it("filters by building, cadence, space type and free text", () => {
    expect(filterAreas(rows, { building: "3" }).map((r) => r.id)).toEqual([20]);
    expect(filterAreas(rows, { cadence: "high" }).map((r) => r.id)).toEqual([
      10,
    ]);
    expect(filterAreas(rows, { space: "office" }).map((r) => r.id)).toEqual([
      11,
    ]);
    expect(filterAreas(rows, { q: "terrazzo" }).map((r) => r.id)).toEqual([11]);
    expect(filterAreas(rows, { q: "gnd-a0020" }).map((r) => r.id)).toEqual([
      20,
    ]);
  });

  it("ignores unknown or malformed filters", () => {
    expect(
      filterAreas(rows, { building: "x", cadence: "bogus", space: "moon" })
    ).toHaveLength(3);
  });
});

describe("findArea", () => {
  it("returns the area with its building and section", () => {
    const found = findArea(buildings, 11);
    expect(found?.building.name).toBe("Air Terminal Building (ATB)");
    expect(found?.section?.name).toBe("Meeting Rooms & Office Spaces");
    expect(found?.row.perDay).toBeCloseTo(0.6);
    expect(findArea(buildings, 20)?.section).toBeNull();
    expect(findArea(buildings, 999)).toBeUndefined();
  });
});

describe("summaries", () => {
  const rows = flattenAreas(buildings);

  it("summarises active buildings and areas", () => {
    const summary = summarise(buildings, rows);
    expect(summary).toMatchObject({
      areas: 3,
      buildings: 2,
      highFrequencyAreas: 1,
      tasks: 3,
    });
    expect(summary.perDay).toBeCloseTo(97.6);
  });

  it("groups workload by active building", () => {
    const [atb, controlTower] = workloadByBuilding(buildings, rows);
    expect(atb).toMatchObject({ areas: 2, highFrequencyAreas: 1 });
    expect(atb?.perDay).toBeCloseTo(96.6);
    expect(controlTower).toMatchObject({
      areas: 1,
      perDay: 1,
      kind: "auxiliary",
    });
    expect(
      workloadByBuilding([{ ...tower, active: false }, terminal], rows)
    ).toHaveLength(1);
  });

  it("lists the most frequently serviced areas first", () => {
    expect(highFrequencyAreas(rows, 5).map((row) => row.id)).toEqual([10]);
  });
});
