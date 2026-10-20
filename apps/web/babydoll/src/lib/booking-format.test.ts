import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatTime,
  groupByDay,
  localDay,
  windowFrom,
} from "./booking-format";

const GRENADA = "America/Grenada";

describe("booking-format", () => {
  it("reads the studio's calendar day, not UTC's", () => {
    // 01:30Z is still the evening before in Grenada (UTC-4).
    expect(localDay("2027-01-05T01:30:00Z", GRENADA)).toBe("2027-01-04");
    expect(localDay("2027-01-05T13:30:00Z", GRENADA)).toBe("2027-01-05");
  });

  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(windowFrom("2027-01-04")).toEqual({
      firstDay: "2027-01-04",
      lastDay: "2027-01-17",
    });
  });

  it("groups slots by local day in order", () => {
    const grouped = groupByDay(
      [
        { starts_at: "2027-01-05T14:00:00Z" },
        { starts_at: "2027-01-05T01:30:00Z" },
        { starts_at: "2027-01-05T13:30:00Z" },
      ],
      GRENADA
    );
    expect(grouped.map((entry) => entry.day)).toEqual([
      "2027-01-04",
      "2027-01-05",
    ]);
    expect(grouped[1]?.slots.map((slot) => slot.starts_at)).toEqual([
      "2027-01-05T13:30:00Z",
      "2027-01-05T14:00:00Z",
    ]);
  });

  it("formats times and dates for the studio's zone", () => {
    expect(formatTime("2027-01-05T13:30:00Z", GRENADA)).toBe("9:30 am");
    expect(formatDateTime("2027-01-05T13:30:00Z", GRENADA)).toContain(
      "5 January 2027"
    );
  });

  it("formats minor units and durations", () => {
    expect(formatMoney(21_000)).toBe("$210");
    expect(formatMoney(1250)).toBe("$12.50");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(135)).toBe("2 hr 15 min");
  });
});
