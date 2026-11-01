import type { PublicMonthSummary } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { dataMonth, monthStats } from "@/lib/month-summary";

const summary: PublicMonthSummary = {
  station_id: "78958",
  station_name: "MBIA",
  month: "2026-09",
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
  last_observation_at: "2026-09-30T12:00:00Z",
  observation_count: 30,
  days_elapsed: 30,
  rain_report_days: 28,
  rainfall_mm: 140.5,
  rain_days: 1,
  rain_day_threshold_mm: 0.2,
  heavy_rain_days: 4,
  heavy_rain_threshold_mm: 10,
  max_temperature_c: 32,
  max_temperature_at: "2026-09-03T12:00:00Z",
  min_temperature_c: 23.8,
  min_temperature_at: "2026-09-06T12:00:00Z",
  longest_dry_spell_days: 9,
  longest_dry_spell_start: "2026-09-12",
  longest_dry_spell_end: "2026-09-20",
  current_dry_spell_days: 0,
  dry_day_threshold_mm: 1,
  mean_wind_kt: 9.7,
  prevailing_wind_direction: "E",
  max_gust_kt: 30,
  max_gust_at: "2026-09-17T18:00:00Z",
  provisional: false,
};

const rows = (s: ReturnType<typeof monthStats>) =>
  s.groups.map((g) => [g.name, ...g.stats.map((x) => [x.value, x.detail])]);

describe("monthStats", () => {
  it("maps the summary to four cards, one per weather parameter", () => {
    expect(rows(monthStats(summary))).toEqual([
      [
        "Rainfall",
        ["140.5", "28 of 30 days reported"],
        ["4", "with 10 mm or more"],
      ],
      ["Temperature", ["32.0", "on 3 September"], ["23.8", "on 6 September"]],
      ["Wind", ["10", "Mostly from the east"], ["30", "on 17 September"]],
      [
        "Dry spells",
        ["9", "12 September to 20 September"],
        ["0", "It rained on the latest day"],
      ],
    ]);
  });

  it("still reports whether the figures are provisional", () => {
    expect(monthStats({ ...summary, provisional: true }).provisional).toBe(
      true
    );
    expect(monthStats(summary).provisional).toBe(false);
  });

  it("keeps unreported figures null instead of zero", () => {
    const stats = monthStats({
      ...summary,
      rainfall_mm: null,
      heavy_rain_days: null,
      max_temperature_c: null,
      max_temperature_at: null,
      min_temperature_c: null,
      min_temperature_at: null,
      mean_wind_kt: null,
      prevailing_wind_direction: null,
      max_gust_kt: null,
      max_gust_at: null,
      longest_dry_spell_days: null,
      longest_dry_spell_start: null,
      longest_dry_spell_end: null,
      current_dry_spell_days: null,
    }).groups.flatMap((g) => g.stats);
    expect(stats.every((s) => s.value === null)).toBe(true);
  });

  it("keeps a real zero rainfall", () => {
    const [rain] = monthStats({
      ...summary,
      rainfall_mm: 0,
      heavy_rain_days: 0,
    }).groups;
    expect(rain?.stats.map((s) => s.value)).toEqual(["0", "0"]);
  });
});

describe("a finished month", () => {
  it("drops 'so far' and 'current' from the labels", () => {
    const labels = monthStats(summary, true).groups.flatMap((g) =>
      g.stats.map((x) => x.label)
    );
    expect(labels).toContain("Total");
    expect(labels).toContain("Dry spell at month end");
    expect(labels).not.toContain("Total so far");
  });
});

describe("dataMonth", () => {
  it("shows the previous month in full until the 5th, then the month so far", () => {
    // 3 Nov, 10:00 in Grenada.
    expect(dataMonth(new Date("2026-11-03T14:00:00Z"))).toEqual({
      month: "2026-10",
      previous: true,
      label: "October at MBIA",
    });
    // 5 Nov, 00:30 in Grenada.
    expect(dataMonth(new Date("2026-11-05T04:30:00Z"))).toEqual({
      month: "2026-11",
      previous: false,
      label: "November so far at MBIA",
    });
    // 2 Jan: December of the year before.
    expect(dataMonth(new Date("2027-01-02T14:00:00Z")).month).toBe("2026-12");
  });
});
