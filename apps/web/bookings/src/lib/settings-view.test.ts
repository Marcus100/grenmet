import { describe, expect, it } from "vitest";
import {
  hhmm,
  moneyInput,
  parseHours,
  parseMoney,
  periodsByDay,
  rowsForDay,
} from "./settings-view";

describe("money", () => {
  it("parses plain amounts into minor units", () => {
    expect(parseMoney("25")).toBe(2500);
    expect(parseMoney("25.5")).toBe(2550);
    expect(parseMoney(" 0.05 ")).toBe(5);
  });

  it("refuses signs, separators and extra decimals", () => {
    for (const bad of ["", "-1", "1,000", "1.234", "abc", "$5"]) {
      expect(parseMoney(bad)).toBeNull();
    }
  });

  it("writes minor units back the way they are typed", () => {
    expect(moneyInput(2500)).toBe("25");
    expect(moneyInput(2550)).toBe("25.50");
    expect(moneyInput(0)).toBe("0");
  });
});

describe("hours", () => {
  it("trims API seconds and shows a spare row", () => {
    expect(hhmm("09:00:00")).toBe("09:00");
    expect(rowsForDay(0)).toBe(2);
    expect(rowsForDay(2)).toBe(3);
  });

  it("groups periods by weekday in time order", () => {
    const days = periodsByDay([
      { weekday: 1, start_time: "13:00:00", end_time: "17:00:00" },
      { weekday: 1, start_time: "09:00:00", end_time: "12:00:00" },
    ]);
    expect(days[1]?.map((p) => p.start_time)).toEqual(["09:00:00", "13:00:00"]);
    expect(days[0]).toEqual([]);
  });

  it("builds periods, skipping empty rows (a day off)", () => {
    const result = parseHours([
      ["hours-0-0-start", "09:00"],
      ["hours-0-0-end", "12:00"],
      ["hours-0-1-start", "13:00"],
      ["hours-0-1-end", "17:00"],
      ["hours-1-0-start", ""],
      ["hours-1-0-end", ""],
      ["providerId", "ignored"],
    ]);
    expect(result).toEqual({
      ok: true,
      periods: [
        { weekday: 0, start_time: "09:00", end_time: "12:00" },
        { weekday: 0, start_time: "13:00", end_time: "17:00" },
      ],
    });
  });

  it("names the day when a row is half empty, backwards or overlapping", () => {
    expect(
      parseHours([
        ["hours-2-0-start", "09:00"],
        ["hours-2-0-end", ""],
      ])
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("Wednesday"),
    });
    expect(
      parseHours([
        ["hours-2-0-start", "10:00"],
        ["hours-2-0-end", "09:00"],
      ])
    ).toMatchObject({ ok: false, message: expect.stringContaining("after") });
    expect(
      parseHours([
        ["hours-4-0-start", "09:00"],
        ["hours-4-0-end", "12:00"],
        ["hours-4-1-start", "11:00"],
        ["hours-4-1-end", "15:00"],
      ])
    ).toMatchObject({ ok: false, message: expect.stringContaining("Friday") });
  });
});
