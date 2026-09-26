import type {
  TimetableTripView,
  TransportRoute,
  TransportShift,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  awaitingConfirmation,
  groupTrips,
  hasBlockingIssues,
  issuesByTrip,
  moveItem,
} from "./timetable";

const route = (id: number): TransportRoute => ({
  id,
  number: id,
  name: `Route ${id}`,
  description: null,
  active: true,
});
const shift = (id: number, name: string): TransportShift => ({
  id,
  slug: name.toLowerCase(),
  name,
  startTime: "05:30",
  endTime: "14:00",
});
const trip = (
  id: number,
  routeId: number,
  shiftId: number,
  status: TimetableTripView["status"] = "confirmed"
): TimetableTripView => ({
  id,
  routeId,
  shiftId,
  calendarId: 1,
  direction: "inbound",
  departTime: "04:30",
  arriveTime: null,
  status,
  notes: null,
  sourceRef: null,
  stops: [],
});

const catalogue = {
  routes: [route(1), route(2), route(3)],
  shifts: [shift(1, "Morning"), shift(2, "Night")],
};

describe("groupTrips", () => {
  it("groups by route then shift in registry order, skipping empty routes", () => {
    const groups = groupTrips(
      [trip(10, 3, 2), trip(11, 1, 1), trip(12, 3, 1)],
      catalogue
    );
    expect(groups.map((group) => group.route.id)).toEqual([1, 3]);
    expect(groups[1].shifts.map((group) => group.shift.name)).toEqual([
      "Morning",
      "Night",
    ]);
    expect(groups[1].tripCount).toBe(2);
  });

  it("keeps empty routes for the draft editor", () => {
    const groups = groupTrips([trip(11, 1, 1)], catalogue, {
      includeEmpty: true,
    });
    expect(groups.map((group) => group.tripCount)).toEqual([1, 0, 0]);
  });
});

describe("issues", () => {
  it("indexes trip issues and detects blocking errors", () => {
    const issues = [
      { severity: "warning", code: "no_stops", message: "x", tripId: 5 },
      { severity: "error", code: "no_trips", message: "y" },
    ] as const;
    expect(issuesByTrip([...issues]).get(5)?.[0].code).toBe("no_stops");
    expect(hasBlockingIssues([...issues])).toBe(true);
    expect(hasBlockingIssues([issues[0]])).toBe(false);
  });

  it("counts trips awaiting confirmation", () => {
    expect(
      awaitingConfirmation([
        trip(1, 1, 1, "awaiting_confirmation"),
        trip(2, 1, 1),
      ])
    ).toBe(1);
  });
});

describe("moveItem", () => {
  it("moves within bounds and returns a new array", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
