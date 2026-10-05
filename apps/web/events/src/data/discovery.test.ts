import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import {
  groupByDay,
  isThisWeekend,
  isTonight,
  parseFilters,
  weekendWindow,
} from "./discovery";

// Saturday 3 October 2026, noon in Grenada.
const saturdayNoon = new Date("2026-10-03T12:00:00-04:00");

describe("weekendWindow", () => {
  it("starts today on a Saturday", () => {
    expect(weekendWindow(saturdayNoon)).toEqual({
      start: "2026-10-03",
      end: "2026-10-04",
    });
  });

  it("looks ahead to Friday from a Wednesday", () => {
    expect(weekendWindow(new Date("2026-09-30T09:00:00-04:00"))).toEqual({
      start: "2026-10-02",
      end: "2026-10-04",
    });
  });

  it("uses the Grenada date, not UTC, late in the evening", () => {
    // 11 PM Sunday in Grenada is already Monday in UTC.
    expect(weekendWindow(new Date("2026-10-04T23:00:00-04:00"))).toEqual({
      start: "2026-10-04",
      end: "2026-10-04",
    });
  });
});

describe("isTonight", () => {
  it("includes an event later today", () => {
    expect(isTonight(makeEvent(), saturdayNoon)).toBe(true);
  });

  it("excludes an event that has already ended today", () => {
    const morningRun = makeEvent({
      startsAt: "2026-10-03T09:00:00Z",
      endsAt: "2026-10-03T11:00:00Z",
    });
    expect(isTonight(morningRun, saturdayNoon)).toBe(false);
  });
});

describe("isThisWeekend", () => {
  it("includes Sunday and excludes the following Monday", () => {
    const sunday = makeEvent({
      startsAt: "2026-10-04T18:00:00Z",
      endsAt: "2026-10-04T22:00:00Z",
    });
    const monday = makeEvent({
      startsAt: "2026-10-05T18:00:00Z",
      endsAt: "2026-10-05T22:00:00Z",
    });
    expect(isThisWeekend(sunday, saturdayNoon)).toBe(true);
    expect(isThisWeekend(monday, saturdayNoon)).toBe(false);
  });
});

describe("groupByDay", () => {
  it("groups by Grenada date in order", () => {
    const groups = groupByDay([
      makeEvent({ id: "a", startsAt: "2026-10-03T20:00:00Z" }),
      makeEvent({ id: "b", startsAt: "2026-10-03T22:00:00Z" }),
      makeEvent({ id: "c", startsAt: "2026-10-04T20:00:00Z" }),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(groups[0]?.events).toHaveLength(2);
  });
});

describe("parseFilters", () => {
  it("keeps known values and drops unknown ones", () => {
    expect(
      parseFilters({
        category: "fete",
        parish: "nowhere",
        when: ["weekend"],
        price: "x",
      })
    ).toEqual({ category: "fete", when: "weekend" });
  });
});
