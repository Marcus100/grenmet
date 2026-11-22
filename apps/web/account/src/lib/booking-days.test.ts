import { describe, expect, it } from "vitest";
import {
  clockRange,
  dayLabel,
  groupByLocalDay,
  localDay,
} from "./booking-days";

const GRENADA = "America/Grenada"; // UTC-4 all year

describe("localDay", () => {
  it("is the calendar day in the zone, not in UTC", () => {
    // 02:30 UTC on 11 Jan is 22:30 on 10 Jan in Grenada.
    expect(localDay("2030-01-11T02:30:00Z", GRENADA)).toBe("2030-01-10");
    expect(localDay("2030-01-11T02:30:00Z", "UTC")).toBe("2030-01-11");
  });
});

describe("dayLabel", () => {
  it("gives the weekday, day, month and year", () => {
    expect(dayLabel("2030-01-10T15:00:00Z", GRENADA)).toBe(
      "Thursday, 10 January 2030"
    );
  });
});

describe("groupByLocalDay", () => {
  const at = (iso: string, id: string) => ({
    id,
    starts_at: iso,
    ends_at: iso,
  });

  it("keeps the API order and starts a new group when the local day changes", () => {
    const groups = groupByLocalDay(
      [
        at("2030-01-10T15:00:00Z", "a"),
        at("2030-01-10T18:00:00Z", "b"),
        at("2030-01-12T15:00:00Z", "c"),
      ],
      GRENADA
    );
    expect(groups.map((group) => group.day)).toEqual([
      "2030-01-10",
      "2030-01-12",
    ]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(groups[1]?.label).toBe("Saturday, 12 January 2030");
  });

  it("puts a late-evening booking under its own local day, not the next UTC day", () => {
    // 23:00 on 10 Jan in Grenada is 03:00 UTC on 11 Jan.
    const groups = groupByLocalDay(
      [at("2030-01-11T03:00:00Z", "late")],
      GRENADA
    );
    expect(groups[0]?.day).toBe("2030-01-10");
  });

  it("returns no groups for no bookings", () => {
    expect(groupByLocalDay([], GRENADA)).toEqual([]);
  });
});

describe("clockRange", () => {
  it("gives the start and end times in the zone", () => {
    expect(
      clockRange("2030-01-10T14:00:00Z", "2030-01-10T15:30:00Z", GRENADA)
    ).toBe("10:00 am to 11:30 am");
  });

  it("labels the times in UTC when asked, so the text never hides the zone", () => {
    expect(
      clockRange("2030-01-10T14:00:00Z", "2030-01-10T15:00:00Z", "UTC", true)
    ).toBe("2:00 pm UTC to 3:00 pm UTC");
  });

  it("names the end day when a booking runs past midnight", () => {
    expect(
      clockRange("2030-01-10T03:00:00Z", "2030-01-11T04:00:00Z", GRENADA)
    ).toBe("11:00 pm to Friday, 11 January 2030, 12:00 am");
  });
});
