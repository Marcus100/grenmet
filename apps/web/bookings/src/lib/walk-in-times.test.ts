import { describe, expect, it } from "vitest";
import { matchesServiceSearch, walkInTimes } from "./walk-in-times";

// Grenada is UTC-4 with no daylight saving: 13:00 UTC is 09:00 on the clock.
const ZONE = "America/Grenada";
const DAY = "2026-11-24";

describe("walkInTimes", () => {
  it("gives each start on the chosen day its clock time and a words label", () => {
    const times = walkInTimes(
      [
        { starts_at: "2026-11-24T13:30:00Z" },
        { starts_at: "2026-11-24T13:00:00Z" },
      ],
      ZONE,
      DAY
    );
    expect(times).toEqual([
      { time: "09:00", label: "9:00 am" },
      { time: "09:30", label: "9:30 am" },
    ]);
  });

  it("drops the other days of the 14-day answer", () => {
    const times = walkInTimes(
      [
        { starts_at: "2026-11-23T13:00:00Z" },
        { starts_at: "2026-11-25T13:00:00Z" },
      ],
      ZONE,
      DAY
    );
    expect(times).toEqual([]);
  });

  it("reads the day on the business clock, not in UTC", () => {
    // 02:00 UTC on the 25th is still the 24th in Grenada (22:00 on the 24th).
    const times = walkInTimes(
      [{ starts_at: "2026-11-25T02:00:00Z" }],
      ZONE,
      DAY
    );
    expect(times).toEqual([{ time: "22:00", label: "10:00 pm" }]);
  });

  it("gives one chip per start time when two providers share it", () => {
    const times = walkInTimes(
      [
        { starts_at: "2026-11-24T13:00:00Z" },
        { starts_at: "2026-11-24T13:00:00Z" },
      ],
      ZONE,
      DAY
    );
    expect(times).toHaveLength(1);
  });
});

describe("matchesServiceSearch", () => {
  const massage = { name: "Deep tissue massage", category: "Massage" };

  it("matches everything for an empty search", () => {
    expect(matchesServiceSearch(massage, "   ")).toBe(true);
  });

  it("matches the name and the category, ignoring case", () => {
    expect(matchesServiceSearch(massage, "DEEP")).toBe(true);
    expect(matchesServiceSearch(massage, "massage")).toBe(true);
  });

  it("does not match a service that has neither", () => {
    expect(matchesServiceSearch(massage, "facial")).toBe(false);
    expect(matchesServiceSearch({ name: "Trim", category: null }, "x")).toBe(
      false
    );
  });
});
