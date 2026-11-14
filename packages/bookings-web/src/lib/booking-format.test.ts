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

  it("prints Eastern Caribbean dollars as EC$, whole or with cents", () => {
    expect(formatMoney(21_000, "XCD")).toBe("EC$210");
    expect(formatMoney(21_050, "XCD")).toBe("EC$210.50");
    expect(formatMoney(1250, "XCD")).toBe("EC$12.50");
    expect(formatMoney(5, "XCD")).toBe("EC$0.05");
  });

  it("prints USD and NZD with their own prefix", () => {
    expect(formatMoney(21_000, "USD")).toBe("US$210");
    expect(formatMoney(19_900, "USD")).toBe("US$199");
    expect(formatMoney(21_000, "NZD")).toBe("NZ$210");
    expect(formatMoney(1250, "NZD")).toBe("NZ$12.50");
  });

  it("prints other currencies as the code and the amount", () => {
    expect(formatMoney(21_000, "GBP")).toBe("GBP 210");
    expect(formatMoney(21_075, "GBP")).toBe("GBP 210.75");
    expect(formatMoney(21_000, "gbp")).toBe("GBP 210");
    expect(formatMoney(-21_000, "XCD")).toBe("-EC$210");
    expect(formatMoney(-1250, "GBP")).toBe("-GBP 12.50");
  });

  it("shows zero and groups thousands", () => {
    expect(formatMoney(0, "XCD")).toBe("EC$0");
    expect(formatMoney(0, "GBP")).toBe("GBP 0");
    expect(formatMoney(125_000, "XCD")).toBe("EC$1,250");
    expect(formatMoney(123_456_700, "XCD")).toBe("EC$1,234,567");
    expect(formatMoney(123_456_789, "USD")).toBe("US$1,234,567.89");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(135)).toBe("2 hr 15 min");
  });
});
