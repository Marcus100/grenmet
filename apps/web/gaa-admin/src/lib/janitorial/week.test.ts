import { describe, expect, it } from "vitest";
import { addDays, dayLabel, grenadaToday, weekDays, weekStart } from "./week";

describe("week helpers", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-07", "2026-01-01")).toBe("2026-10-05");
    expect(weekStart("2026-10-05", "2026-01-01")).toBe("2026-10-05");
    expect(weekStart("2026-10-11", "2026-01-01")).toBe("2026-10-05");
  });

  it("falls back to today for a missing or malformed date", () => {
    expect(weekStart(undefined, "2026-09-25")).toBe("2026-09-21");
    expect(weekStart("next week", "2026-09-25")).toBe("2026-09-21");
  });

  it("lists seven days across a month boundary", () => {
    expect(weekDays("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(addDays("2026-10-05", -7)).toBe("2026-09-28");
  });

  it("uses Grenada's date, not UTC's", () => {
    // 02:00 UTC on 26 Sept is still 25 Sept in Grenada (UTC−4).
    expect(grenadaToday(new Date("2026-09-26T02:00:00Z"))).toBe("2026-09-25");
  });

  it("labels days briefly", () => {
    expect(dayLabel("2026-10-05")).toBe("Mon 5 Oct");
  });
});
