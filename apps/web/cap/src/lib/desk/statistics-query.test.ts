import { describe, expect, it } from "vitest";
import {
  HAZARD_MAX_LENGTH,
  isCalendarDay,
  parseStatisticsQuery,
  statisticsQueryString,
} from "./statistics-query";

describe("parseStatisticsQuery", () => {
  it("accepts no filters at all, leaving the period to the API", () => {
    expect(parseStatisticsQuery({})).toEqual({
      end: null,
      hazard: null,
      ok: true,
      start: null,
    });
  });

  it("reads a period and a hazard", () => {
    expect(
      parseStatisticsQuery({
        end: "2026-12-31",
        hazard: " High Wind Warning ",
        start: "2026-01-01",
      })
    ).toEqual({
      end: "2026-12-31",
      hazard: "High Wind Warning",
      ok: true,
      start: "2026-01-01",
    });
  });

  it("treats empty form fields as not set", () => {
    expect(parseStatisticsQuery({ end: "", hazard: "", start: "" })).toEqual({
      end: null,
      hazard: null,
      ok: true,
      start: null,
    });
  });

  it.each([
    ["2026-02-30"],
    ["26-01-01"],
    ["2026/01/01"],
    ["tomorrow"],
    ["2026-13-01"],
  ])("refuses the start date %j", (start) => {
    const result = parseStatisticsQuery({ start });
    expect(result.ok).toBe(false);
  });

  it("refuses a start date after the end date", () => {
    const result = parseStatisticsQuery({
      end: "2026-01-01",
      start: "2026-02-01",
    });
    expect(result).toEqual({
      ok: false,
      problems: ["The start date must not be after the end date."],
    });
  });

  it("refuses repeated parameters rather than picking one", () => {
    expect(
      parseStatisticsQuery({ start: ["2026-01-01", "2026-02-01"] }).ok
    ).toBe(false);
    expect(parseStatisticsQuery({ hazard: ["a", "b"] }).ok).toBe(false);
  });

  it("refuses a hazard that is too long or holds control characters", () => {
    expect(
      parseStatisticsQuery({ hazard: "x".repeat(HAZARD_MAX_LENGTH + 1) }).ok
    ).toBe(false);
    expect(parseStatisticsQuery({ hazard: "bad\u0000text" }).ok).toBe(false);
  });
});

describe("isCalendarDay", () => {
  it("knows leap days", () => {
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
  });
});

describe("statisticsQueryString", () => {
  it("is empty without filters", () => {
    expect(
      statisticsQueryString({ end: null, hazard: null, start: null })
    ).toBe("");
  });

  it("encodes the hazard and keeps only the filters that are set", () => {
    expect(
      statisticsQueryString({
        end: null,
        hazard: "Heavy Rainfall & Flood",
        start: "2026-01-01",
      })
    ).toBe("?start=2026-01-01&hazard=Heavy+Rainfall+%26+Flood");
  });
});
